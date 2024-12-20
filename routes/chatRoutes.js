const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { getChatHistory, upsertChatHistory, categorizeChat } = require('../services/chatService');
const { callOpenAI } = require('../services/openaiService');
const { extractTextFromFile } = require('../services/fileProcessingService');

// Upload route
router.post('/upload', upload.single('file'), async (req, res) => {
    const file = req.file;
    const { chatId } = req.body;
    const userId = req.user && req.user.email ? req.user.email : 'anonymous';

    if (!req.user || !req.user.email) {
        return res.status(401).json({ error: 'User not authenticated' });
    }
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    if (!chatId) return res.status(400).json({ error: 'Missing chatId' });

    if (!chatId.startsWith(`${userId}_chat_`)) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        const extractedText = await extractTextFromFile(file);
        let chat = await getChatHistory(chatId);
        if (!chat) {
            chat = {
                id: chatId,
                title: 'File Upload',
                messages: [],
                timestamp: new Date().toISOString(),
                total_document_count: 0,
                total_document_size: 0,
                documentContent: '',
            };
        }

        if (typeof chat.total_document_count !== 'number') chat.total_document_count = 0;
        if (typeof chat.total_document_size !== 'number') chat.total_document_size = 0;

        chat.total_document_count += 1;
        chat.total_document_size += file.size || 0;

        chat.messages.push({
            role: 'user',
            content: `Uploaded a document: ${file.originalname}`,
            timestamp: new Date().toISOString(),
            documentSize: file.size || 0,
        });

        chat.documentContent = (chat.documentContent || '') + '\n' + extractedText;
        await upsertChatHistory(chat);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error processing file:', error);
        res.status(500).json({ error: 'Failed to process the uploaded file.' });
    }
});

// Chat route
router.post('/chat', upload.array('image'), async (req, res) => {
    const { message, tutorMode, chatId: providedChatId } = req.body;
    const userId = req.user && req.user.email ? req.user.email : 'anonymous';

    if (message === "test-rate-limit") {
        return res.status(429).json({ retryAfter: 10 });
    }

    let chatId = providedChatId || `${userId}_chat_${Math.random().toString(36).substr(2, 9)}`;

    if (!message && (!req.files || req.files.length === 0)) {
        return res.status(400).json({ error: 'Missing message or files' });
    }

    let chat = await getChatHistory(chatId);
    const isNewChat = !chat;
    if (!chat) {
        chat = {
            id: chatId,
            title: 'New Chat',
            visibility: 1,
            messages: [],
            timestamp: new Date().toISOString(),
            total_tokens_used: 0,
            total_interactions: 0,
            average_tokens_per_interaction: 0,
            total_image_count: 0,
            total_image_size: 0,
            total_document_count: 0,
            total_document_size: 0,
        };
    }

    if (typeof chat.total_document_count !== 'number') chat.total_document_count = 0;
    if (typeof chat.total_document_size !== 'number') chat.total_document_size = 0;

    let messages = chat.messages.slice(-20).map(msg => ({
        role: msg.role,
        content: `[${msg.timestamp}] ${msg.content}`,
        tokens: msg.tokens
    }));

    const systemMessage = {
        role: 'system',
        content: tutorMode
            ? 'You are an AI tutor...'
            : "You are KaplanGPT ...",
        timestamp: new Date().toISOString(),
    };
    messages.unshift(systemMessage);

    let userContentArray = [];
    if (message) {
        userContentArray.push({ type: 'text', text: message });
    }

    if (req.files && req.files.length > 0) {
        for (const file of req.files) {
            if (file.mimetype.startsWith('image/')) {
                const base64Image = file.buffer.toString('base64');
                const imageUrl = `data:${file.mimetype};base64,${base64Image}`;
                userContentArray.push({ type: "image_url", image_url: { url: imageUrl } });

                if (typeof chat.total_image_count !== 'number') chat.total_image_count = 0;
                if (typeof chat.total_image_size !== 'number') chat.total_image_size = 0;
                chat.total_image_count += 1;
                chat.total_image_size += file.size || 0;
            }
        }
    }

    if (userContentArray.length > 0) {
        messages.push({
            role: 'user',
            content: userContentArray,
            timestamp: new Date().toISOString(),
        });
        chat.messages.push({
            role: 'user',
            content: message || 'Sent images',
            timestamp: new Date().toISOString(),
            tokens: 0,
        });
    }

    if (chat.documentContent) {
        messages.push({
            role: 'user',
            content: `[${new Date().toISOString()}] Here is the document content:\n${chat.documentContent}`,
            timestamp: new Date().toISOString(),
        });
    }

    // Call OpenAI
    const data = await callOpenAI(messages);
    const aiResponse = data.choices[0].message.content;
    const { prompt_tokens, completion_tokens, total_tokens } = data.usage;

    chat.messages.push({
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date().toISOString(),
        tokens: completion_tokens,
    });

    chat.total_tokens_used += total_tokens;
    chat.total_interactions += 2;
    chat.average_tokens_per_interaction = chat.total_tokens_used / chat.total_interactions;
    chat.timestamp = new Date().toISOString();

    if (isNewChat) {
        const titlePrompt = [
            { role: 'system', content: 'You are an assistant that generates concise titles for conversations. The title should be 5 words or less and contain no quotes.' },
            { role: 'user', content: message || 'The title should be 5 words or less' }
        ];
        const titleData = await callOpenAI(titlePrompt);
        const generatedTitle = titleData.choices[0].message.content.trim();
        chat.title = generatedTitle;
    }

    await upsertChatHistory(chat);
    const category = categorizeChat(chat.timestamp);

    res.json({
        response: aiResponse,
        chatId,
        category,
        tokens: total_tokens,
        average_tokens_per_interaction: chat.average_tokens_per_interaction,
        total_image_count: chat.total_image_count,
        total_image_size: chat.total_image_size,
        total_document_count: chat.total_document_count,
        total_document_size: chat.total_document_size,
    });
});

router.get('/chats', async (req, res) => {
    try {
        const userId = req.user && req.user.email ? req.user.email : 'anonymous';
        const querySpec = { query: 'SELECT c.id, c.title, c.timestamp, c.visibility FROM c' };
        const { container } = require('../db/cosmosClient');
        const { resources: chats } = await container.items.query(querySpec).fetchAll();

        const { categorizeChat } = require('../services/chatService');
        const filteredChats = chats.filter(chat => chat.id.startsWith(`${userId}_chat_`));
        const categorizedChats = {};

        filteredChats.forEach(chat => {
            const category = categorizeChat(chat.timestamp);
            if (!categorizedChats[category]) categorizedChats[category] = [];
            categorizedChats[category].push({
                chatId: chat.id,
                title: chat.title,
                visibility: chat.visibility,
            });
        });

        res.json(categorizedChats);
    } catch (error) {
        console.error('Error retrieving chats:', error);
        res.status(500).json({ error: 'Failed to retrieve chats' });
    }
});

router.get('/chats/:chatId', async (req, res) => {
    const { chatId } = req.params;
    const userId = req.user && req.user.email ? req.user.email : 'anonymous';

    if (!chatId.startsWith(`${userId}_chat_`)) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        const chat = await getChatHistory(chatId);
        if (chat) res.json(chat);
        else res.status(404).json({ error: 'Chat not found' });
    } catch (error) {
        console.error('Error retrieving chat:', error);
        res.status(500).json({ error: 'Failed to retrieve chat' });
    }
});

router.delete('/chats/:chatId', async (req, res) => {
    const { chatId } = req.params;
    const { container } = require('../db/cosmosClient');
    try {
        const { resource: chat } = await container.item(chatId, chatId).read();
        if (!chat) return res.status(404).json({ error: 'Chat not found' });

        chat.visibility = 2;
        await container.items.upsert(chat, { partitionKey: chat.id });
        res.json({ message: 'Chat visibility updated' });
    } catch (error) {
        console.error('Error updating chat visibility:', error);
        res.status(500).json({ error: 'Failed to update chat visibility' });
    }
});

module.exports = router;
