// ========================================
// Load Environment & Dependencies
// ========================================
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const multer = require('multer');
const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const xlsx = require('xlsx');
const tesseract = require('tesseract.js');
const { CosmosClient } = require("@azure/cosmos");
const helmet = require('helmet');
const textract = require('textract');
const { htmlToText } = require('html-to-text');
const mime = require('mime-types');
const removeMarkdown = require('remove-markdown');

// Lazy load node-fetch to avoid runtime overhead if not used
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// ========================================
// Configuration
// ========================================
const app = express();
const port = 8080;
const isDevelopment = process.env.NODE_ENV === 'development';
const NINETY_DAYS_IN_MS = 90 * 24 * 60 * 60 * 1000;

// ========================================
// OpenAI & Cosmos DB Setup
// ========================================
const openai = new OpenAI({ apiKey: process.env.AZURE_OPENAI_API_KEY });
const client = new CosmosClient({
    endpoint: process.env.COSMOS_DB_ENDPOINT,
    key: process.env.COSMOS_DB_KEY,
});
const database = client.database(process.env.COSMOS_DB_DATABASE_ID);
const container = database.container(process.env.COSMOS_DB_CONTAINER_ID);

// ========================================
// File Upload Setup (in-memory)
// ========================================
const upload = multer({ storage: multer.memoryStorage() });

// ========================================
// Middleware: Session and Security
// ========================================
app.use(session({
    secret: process.env.SESSION_SECRET || 'defaultSecret3',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
    },
}));

app.use(express.json());
app.use(express.static('public'));

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'", "https://login.microsoftonline.com"],
            scriptSrc: ["'self'", "https://login.microsoftonline.com"],
            connectSrc: ["'self'", "https://login.microsoftonline.com"],
        },
    },
}));

// ========================================
// Authentication Middleware
// ========================================
async function getUserInfo(req, res, next) {
    const header = req.headers['x-ms-client-principal'];

    if (header) {
        try {
            const user = JSON.parse(Buffer.from(header, 'base64').toString('ascii'));
            if (user && user.claims) {
                const emailClaim = user.claims.find(claim =>
                    claim.typ === 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'
                );
                if (emailClaim) user.email = emailClaim.val;
                
                const nameClaim = user.claims.find(claim =>
                    claim.typ === 'name' ||
                    claim.typ === 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'
                );
                if (nameClaim) user.name = nameClaim.val;

            } else {
                console.error('User claims not found');
            }
            req.user = user;
            return next();
        } catch (error) {
            console.error('Error parsing x-ms-client-principal header:', error);
            return next();
        }
    } else {
        console.error('x-ms-client-principal header not found');

        // Attempt to fetch user info from /.auth/me
        try {
            const authMeResponse = await fetch(`https://${req.get('host')}/.auth/me`, {
                headers: { 'Cookie': req.headers['cookie'] },
            });

            if (authMeResponse.ok) {
                const data = await authMeResponse.json();
                if (data.length > 0 && data[0].user_claims) {
                    const user = { claims: data[0].user_claims };
                    const emailClaim = user.claims.find(claim =>
                        claim.typ === 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'
                    );
                    if (emailClaim) user.email = emailClaim.val;

                    const nameClaim = user.claims.find(claim =>
                        claim.typ === 'name' ||
                        claim.typ === 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'
                    );
                    if (nameClaim) user.name = nameClaim.val;

                    req.user = user;
                } else {
                    console.error('No user claims found in /.auth/me response');
                }
            } else {
                console.error('Failed to fetch /.auth/me:', authMeResponse.statusText);
            }
        } catch (error) {
            console.error('Error fetching /.auth/me:', error);
        }
        next();
    }
}

async function ensureAuthenticated(req, res, next) {
    try {
        if (req.user && req.user.email) {
            // User is authenticated
            return next();
        }

        // Handle unauthenticated access based on request type and environment
        if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
            // For AJAX requests, respond with a 401 Unauthorized status
            return res.status(401).json({ error: 'Unauthorized' });
        } else if (isDevelopment) {
            // In development mode, simulate authentication
            req.user = {
                email: 'JSerpis@delta.kaplaninc.com',
                name: 'Josh Serpis',
                userRoles: ['authenticated'],
            };
            return next();
        } else {
            // In production, redirect unauthenticated users to the login page
            return res.redirect('/login');
        }
    } catch (error) {
        console.error('Error in ensureAuthenticated middleware:', error);
        // Pass the error to the next middleware/error handler
        return next(error);
    }
}

// Mock authentication for development
if (isDevelopment) {
    app.use((req, res, next) => {
        if (req.session && req.session.user) {
            req.user = req.session.user;
        } else {
            req.user = {
                email: 'JSerpis@delta.kaplaninc.com',
                name: 'Josh Serpis',
                userRoles: ['authenticated'],
            };
            req.session.user = req.user;
        }
        next();
    });
} else {
    // ========================================
    // Apply Authentication Middleware in Production
    // ========================================
    app.use(getUserInfo);
    app.use(ensureAuthenticated);
}

// ========================================
// Helper Functions: Chat Database Access
// ========================================
async function getChatHistory(chatId) {
    try {
        const { resource: chat } = await container.item(chatId, chatId).read();
        return chat;
    } catch (error) {
        if (error.code === 404) return null;
        throw error;
    }
}

async function upsertChatHistory(chat) {
    try {
        await container.items.upsert(chat, { partitionKey: chat.id });
    } catch (error) {
        console.error('Error upserting chat history:', error);
        throw error;
    }
}

function categorizeChat(timestamp) {
    const chatDate = new Date(timestamp);
    const now = new Date();

    const chatDateOnly = Date.UTC(chatDate.getFullYear(), chatDate.getMonth(), chatDate.getDate());
    const nowDateOnly = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

    const diffInDays = Math.floor((nowDateOnly - chatDateOnly) / (1000 * 60 * 60 * 24));
    if (diffInDays === 0) return 'Today';
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays <= 7) return 'Previous 7 Days';
    if (diffInDays <= 30) return 'Previous 30 Days';
    return 'Older';
}

// ========================================
// Routes
// ========================================

app.get('/session-secret', (req, res) => {
    res.json({ secret: req.user ? req.user.displayName : 'Not authenticated' });
});

app.post('/upload', upload.single('file'), async (req, res) => {
    const file = req.file;
    const { chatId } = req.body;
    const userId = req.user && req.user.email ? req.user.email : 'anonymous';

    if (!req.user || !req.user.email) {
        console.error('User not authenticated or email not found');
        return res.status(401).json({ error: 'User not authenticated' });
    }
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    if (!chatId) return res.status(400).json({ error: 'Missing chatId' });

    if (!chatId.startsWith(`${userId}_chat_`)) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        // 1) Keep the file in-session only (no Cosmos)
        if (!req.session.tempFiles) {
            req.session.tempFiles = [];
        }
        req.session.tempFiles.push({
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            buffer: file.buffer,
            uploadedAt: new Date()
        });

        // 2) Extract text but do NOT store in Cosmos
        let extractedText = '';

        // Handle images with OCR (tesseract.js)
        if (file.mimetype.startsWith('image/')) {
            const { data: { text } } = await tesseract.recognize(file.buffer);
            extractedText = text;
        } else {
            const extension = path.extname(file.originalname).toLowerCase();
            const mimetype = mime.lookup(extension) || file.mimetype;

            switch (true) {
                case mimetype === 'application/pdf' || extension === '.pdf':
                    const pdfData = await pdfParse(file.buffer);
                    extractedText = pdfData.text;
                    break;
                case mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || extension === '.docx':
                    const { value } = await mammoth.extractRawText({ buffer: file.buffer });
                    extractedText = value;
                    break;
                case mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || extension === '.xlsx':
                    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
                    workbook.SheetNames.forEach(sheetName => {
                        const sheet = workbook.Sheets[sheetName];
                        extractedText += xlsx.utils.sheet_to_csv(sheet) + '\n';
                    });
                    break;
                case mimetype === 'text/plain' || extension === '.txt':
                    extractedText = file.buffer.toString('utf-8');
                    break;
                case mimetype === 'text/markdown' || extension === '.md':
                    extractedText = removeMarkdown(file.buffer.toString('utf-8'));
                    break;
                case mimetype === 'text/html' || extension === '.html' || extension === '.htm':
                    extractedText = htmlToText(file.buffer.toString('utf-8'), { wordwrap: 130 });
                    break;
                case mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || extension === '.pptx':
                    extractedText = await new Promise((resolve, reject) => {
                        textract.fromBufferWithMime(file.mimetype, file.buffer, (err, text) => {
                            if (err) reject(err);
                            else resolve(text);
                        });
                    });
                    break;
                default:
                    return res.status(400).json({ error: 'Unsupported file type.' });
            }
        }

        // 3) Keep extracted text in session memory for the chat, not in Cosmos
        if (!req.session.extractedTexts) {
            req.session.extractedTexts = [];
        }
        req.session.extractedTexts.push({
            chatId,
            fileName: file.originalname,
            text: extractedText
        });

        // 4) Load chat from Cosmos (just for stats & references) 
        let chat = await getChatHistory(chatId);
        if (!chat) {
            chat = {
                id: chatId,
                title: 'File Upload',
                messages: [],
                timestamp: new Date().toISOString(),
                total_document_count: 0,
                total_document_size: 0
                // Notice we removed documentContent if you truly don't want to store any text
            };
        }

        // 5) Ensure fields for doc stats
        if (typeof chat.total_document_count !== 'number') chat.total_document_count = 0;
        if (typeof chat.total_document_size !== 'number') chat.total_document_size = 0;

        // 6) Update doc stats in Cosmos (KEEP)
        chat.total_document_count += 1;
        chat.total_document_size += file.size || 0;

        // 7) Add a message referencing the file (but NOT adding the actual text)
        chat.messages.push({
            role: 'user',
            content: `Uploaded a document: ${file.originalname}`,
            timestamp: new Date().toISOString(),
            documentSize: file.size || 0,
        });

        // 8) DO NOT store the extracted text in Cosmos (skip chat.documentContent).
        //    We only store doc stats & the reference message.

        // 9) Upsert chat in Cosmos
        await upsertChatHistory(chat);

        // Done
        res.status(200).json({ success: true });

    } catch (error) {
        console.error('Error processing file:', error);
        res.status(500).json({ error: 'Failed to process the uploaded file.' });
    }
});


app.post('/chat', upload.array('image'), async (req, res) => {
    const { message, tutorMode, chatId: providedChatId } = req.body;
    const userId = req.user && req.user.email ? req.user.email : 'anonymous';

    // Test condition: If user sends "test-rate-limit" message, respond with a 429 error
    if (message === "test-rate-limit") {
        return res.status(429).json({ retryAfter: 10 });
    }

    let chatId = providedChatId;
    if (!chatId) {
        const randomNumber = Math.random().toString(36).substr(2, 9);
        chatId = `${userId}_chat_${randomNumber}`;
    }

    // If no message and no images, return error
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
            total_document_size: 0
        };
    }

    // Ensure numeric fields
    if (typeof chat.total_document_count !== 'number') chat.total_document_count = 0;
    if (typeof chat.total_document_size !== 'number') chat.total_document_size = 0;

    // Prepare last 20 messages for context, including timestamps in content
    let messages = chat.messages.slice(-20).map(msg => ({
        role: msg.role,
        content: `[${msg.timestamp}] ${msg.content}`,
        tokens: msg.tokens
    }));

    // Add system message with or without Tutor Mode
    const systemMessage = {
        role: 'system',
        content: tutorMode
            ? 'You are an AI tutor. Please provide step-by-step explanations as if teaching the user.'
            : "You are KaplanGPT, an assistant at Kaplan UK, a company providing apprenticeships and professional qualification in accounting & tax as well as data and IT. \n\nYour job is to help Kaplan staff members do their jobs. The staff work in the production and delivery of Kaplan's educational products. You may talk freely about topics that a user wants to discuss. You will be provided with data, documents and Kaplan's IP that you should converse freely about to the user.\n\nAs well as providing information about Kaplan, you will also assist with summarising; rewriting; checking spelling, grammar and tone of voice; helping to write materials; writing, checking and helping to refactor code; managing staff members; analysing documents and providing details contained within them; day-to-day admin tasks; as well as any other tasks that help staff at Kaplan perform their roles.\n\nIf a user provides you with a source of content and queries it, you must limit your answer to information contained within that content unless specifically asked otherwise.\n\nYou must not answer any questions on material produced by Tolley that a user adds as a prompt. If there is evidence to suggest the content you are provided with is produced by Tolley, you must let the user know you are not able to answer questions on Tolley material as requested by Tolley. You may answer general questions about Tolley as a business.\n\nYou have a friendly and professional manner and will always use British English. You must also use British as the default setting for other things such as when asked about law, regulations, standards or popular culture unless explicitly asked otherwise by the user. \n\n Remembers all previous interactions in this chat and can recall them when asked.",
        timestamp: new Date().toISOString(),
    };
    messages.unshift(systemMessage);

    // Build user content array with text and images
    let userContentArray = [];
    if (message) {
        userContentArray.push({ type: 'text', text: message });
    }

    // Process multiple images
    if (req.files && req.files.length > 0) {
        for (const file of req.files) {
            if (file.mimetype.startsWith('image/')) {
                const base64Image = file.buffer.toString('base64');
                const imageUrl = `data:${file.mimetype};base64,${base64Image}`;

                userContentArray.push({ type: "image_url", image_url: { url: imageUrl } });

                // Update image stats
                if (typeof chat.total_image_count !== 'number') chat.total_image_count = 0;
                if (typeof chat.total_image_size !== 'number') chat.total_image_size = 0;

                chat.total_image_count += 1;
                chat.total_image_size += file.size || 0;
            }
        }
    }

    // If we have at least text or images, create a user message
    if (userContentArray.length > 0) {
        messages.push({
            role: 'user',
            content: userContentArray,
            timestamp: new Date().toISOString(),
        });

        // Also store in chat history (just store the text or "Sent images")
        chat.messages.push({
            role: 'user',
            content: message || 'Sent images',
            timestamp: new Date().toISOString(),
            tokens: 0,
        });
    }

    // === NEW: Incorporate ephemeral text from session (if any exists for this chat) ===
    // We do NOT store it in Cosmos, but we DO let the model see it for context.
    if (req.session.extractedTexts && req.session.extractedTexts.length > 0) {
        // Filter only those texts for this particular chatId
        const relevantTexts = req.session.extractedTexts
            .filter(item => item.chatId === chatId)
            .map(item => `From ${item.fileName}: ${item.text}`);

        // If any relevant text, push it as a user message for context
        if (relevantTexts.length > 0) {
            const combinedText = relevantTexts.join('\n\n');
            messages.push({
                role: 'user',
                content: `[Session-based file content for chat ${chatId}]\n${combinedText}`,
                timestamp: new Date().toISOString(),
            });
        }
    }
    // === END NEW CODE ===

    // Call OpenAI
    const payload = {
        model: 'gpt-4o',
        messages: messages,
        temperature: 0.7,
    };

    const response = await fetch(`${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}/chat/completions?api-version=${process.env.AZURE_OPENAI_API_VERSION}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-key': process.env.AZURE_OPENAI_API_KEY,
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Error from OpenAI API:', errorText);
        return res.status(500).json({ error: `OpenAI request failed: ${response.statusText}` });
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;
    const { prompt_tokens, completion_tokens, total_tokens } = data.usage;

    console.log('AI Response:', aiResponse);
    console.log(`Tokens - Input: ${prompt_tokens}, Output: ${completion_tokens}, Total: ${total_tokens}`);

    // Store assistant response in chat
    chat.messages.push({
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date().toISOString(),
        tokens: completion_tokens,
    });

    // Update stats
    chat.total_tokens_used += total_tokens;
    chat.total_interactions += 2;
    chat.average_tokens_per_interaction = chat.total_tokens_used / chat.total_interactions;
    chat.timestamp = new Date().toISOString();

    // Generate a title for a new chat
    if (isNewChat) {
        const titlePrompt = [
            { role: 'system', content: 'You are an assistant that generates concise titles for conversations. The title should be 5 words or less and contain no quotes.' },
            { role: 'user', content: message || 'The title should be 5 words or less and contain no quotes.' }
        ];

        const titlePayload = { model: 'gpt-4o', messages: titlePrompt };

        const titleResponse = await fetch(`${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}/chat/completions?api-version=${process.env.AZURE_OPENAI_API_VERSION}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': process.env.AZURE_OPENAI_API_KEY,
            },
            body: JSON.stringify(titlePayload),
        });

        if (titleResponse.ok) {
            const titleData = await titleResponse.json();
            const generatedTitle = titleData.choices[0].message.content.trim();
            chat.title = generatedTitle;
        } else {
            const errorText = await titleResponse.text();
            console.error('Error generating title:', errorText);
        }
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

app.get('/chats', async (req, res) => {
    try {
        const userId = req.user && req.user.email ? req.user.email : 'anonymous';

        // Query all chats for the container
        const querySpec = { query: 'SELECT c.id, c.title, c.timestamp, c.visibility FROM c' };
        const { resources: chats } = await container.items.query(querySpec).fetchAll();

        // Filter by current user's chats
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

app.get('/chats/:chatId', async (req, res) => {
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

app.delete('/chats/:chatId', async (req, res) => {
    const { chatId } = req.params;
    try {
        const { resource: chat } = await container.item(chatId, chatId).read();
        if (!chat) return res.status(404).json({ error: 'Chat not found' });

        chat.visibility = 2;
        await upsertChatHistory(chat);
        res.json({ message: 'Chat visibility updated' });
    } catch (error) {
        console.error('Error updating chat visibility:', error);
        res.status(500).json({ error: 'Failed to update chat visibility' });
    }
});

async function deleteOldChats() {
    try {
        const querySpec = { query: 'SELECT * FROM c' };
        const { resources: chats } = await container.items.query(querySpec).fetchAll();

        const now = new Date();
        for (const chat of chats) {
            const chatTimestamp = new Date(chat.timestamp);
            if ((now - chatTimestamp) > NINETY_DAYS_IN_MS) {
                delete chat.messages;
                delete chat.timestamp;
                delete chat.total_document_count;
                delete chat.total_image_count;
                await container.items.upsert(chat, { partitionKey: chat.id });
                console.log(`Updated chat with ID: ${chat.id} by deleting specified fields (older than 90 days).`);
            }
        }
    } catch (error) {
        console.error('Error deleting fields from old chats:', error);
    }
}

// Run old chat cleanup on startup and every 24 hours
deleteOldChats();
setInterval(deleteOldChats, 24 * 60 * 60 * 1000);

// Auth Routes
if (isDevelopment) {
    app.get('/login', (req, res) => {
        req.user = { userId: 'test-user-id', userDetails: 'Josh Serpis', userRoles: ['authenticated'] };
        res.redirect('/');
    });

    app.get('/logout', (req, res) => {
        req.user = null;
        res.redirect('/');
    });
} else {
    app.get('/login', (req, res) => res.redirect('/.auth/login/aad'));
    app.get('/logout', (req, res) => res.redirect('/.auth/logout'));
}

app.get('/user-info', (req, res) => {
    const userId = req.user.email;
    const userName = req.user.name || 'User';
    res.json({ userId, userName });
});

// Debug middleware
app.use((req, res, next) => {
    console.log('Authenticated user:', req.user);
    next();
});

// ========================================
// Start the Server
// ========================================
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
