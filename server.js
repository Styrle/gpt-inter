const express = require('express');
const session = require('express-session');
const multer = require('multer');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const xlsx = require('xlsx');
const tesseract = require('tesseract.js');
const { CosmosClient } = require("@azure/cosmos");
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = 3000;

const upload = multer({ storage: multer.memoryStorage() });

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

app.use(session({
    secret: process.env.SESSION_SECRET || 'defaultSecret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } 
}));

app.get('/session-secret', (req, res) => {
    res.json({ secret: req.session.secret || 'defaultSecret' });
});

app.use(express.json());
app.use(express.static('public'));

const client = new CosmosClient({
    endpoint: process.env.COSMOS_DB_ENDPOINT,
    key: process.env.COSMOS_DB_KEY,
});

// Get a reference to the database and container
const database = client.database(process.env.COSMOS_DB_DATABASE_ID);
const container = database.container(process.env.COSMOS_DB_CONTAINER_ID);

// Function to index document into AI Search
async function indexDocumentToAISearch(document) {
    const aiSearchApiUrl = process.env.AI_SEARCH_API_URL;
    const aiSearchApiKey = process.env.AI_SEARCH_API_KEY;
    const indexName = process.env.AI_SEARCH_INDEX_NAME;
    const apiVersion = process.env.AI_SEARCH_API_VERSION || '2021-04-30-Preview';

    if (!aiSearchApiUrl || !aiSearchApiKey || !indexName) {
        throw new Error('AI Search API URL, API Key, or Index Name is not set in environment variables.');
    }

    const indexEndpoint = `${aiSearchApiUrl}/indexes/${encodeURIComponent(indexName)}/docs/index?api-version=${apiVersion}`;

    const requestBody = {
        value: [document],
    };

    try {
        const response = await fetch(indexEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': aiSearchApiKey,
            },
            body: JSON.stringify(requestBody),
        });

        console.log(`Azure Cognitive Search Indexing Response Status: ${response.status}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Azure Cognitive Search Indexing API Error Response: ${errorText}`);
            throw new Error(`AI Search Indexing Error: ${errorText}`);
        }

        const results = await response.json();
        console.log(`Azure Cognitive Search Indexing Results: ${JSON.stringify(results)}`);

        return results;
    } catch (error) {
        console.error(`Error during Azure Cognitive Search Indexing API call: ${error.message}`);
        throw new Error(`AI Search Indexing Error: ${error.message}`);
    }
}

// Function to search documents in AI Search
async function searchAI(text) {
    const aiSearchApiUrl = process.env.AI_SEARCH_API_URL;
    const aiSearchApiKey = process.env.AI_SEARCH_API_KEY;
    const indexName = process.env.AI_SEARCH_INDEX_NAME;
    const apiVersion = process.env.AI_SEARCH_API_VERSION || '2021-04-30-Preview';

    if (!aiSearchApiUrl || !aiSearchApiKey || !indexName) {
        throw new Error('AI Search API URL, API Key, or Index Name is not set in environment variables.');
    }

    const searchEndpoint = `${aiSearchApiUrl}/indexes/${encodeURIComponent(indexName)}/docs/search?api-version=${apiVersion}`;

    console.log(`Querying Azure Cognitive Search at: ${searchEndpoint}`);

    const requestBody = {
        search: text,
        select: "chunk_id, chunk", // Adjust fields based on your index schema
        top: 10,
    };

    try {
        const response = await fetch(searchEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': aiSearchApiKey,
            },
            body: JSON.stringify(requestBody),
        });

        console.log(`Azure Cognitive Search Response Status: ${response.status}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Azure Cognitive Search API Error Response: ${errorText}`);
            throw new Error(`AI Search Query Error: ${errorText}`);
        }

        const results = await response.json();
        console.log(`Azure Cognitive Search Results: ${JSON.stringify(results)}`);

        if (!results.value) {
            console.warn('Azure Cognitive Search response does not contain "value" field.');
            return [];
        }

        return results.value; // Azure Cognitive Search returns results under 'value' key
    } catch (error) {
        console.error(`Error during Azure Cognitive Search API call: ${error.message}`);
        throw new Error(`AI Search Query Error: ${error.message}`);
    }
}

// Function to get chat history
async function getChatHistory(chatId) {
    try {
        const { resource: chat } = await container.item(chatId, chatId).read();
        return chat;
    } catch (error) {
        if (error.code === 404) {
            // Chat not found
            return null;
        } else {
            throw error;
        }
    }
}

// Helper function to upsert chat history into Cosmos DB
async function upsertChatHistory(chat) {
    try {
        // Add a new chat if it does not exist or update the existing chat
        await container.items.upsert(chat, { partitionKey: chat.id });
    } catch (error) {
        console.error('Error upserting chat history:', error);
        throw error;
    }
}

// Function to categorize chat by date
function categorizeChat(timestamp) {
    const chatDate = new Date(timestamp);
    const now = new Date();

    const chatDateOnly = Date.UTC(chatDate.getFullYear(), chatDate.getMonth(), chatDate.getDate());
    const nowDateOnly = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

    const diffInDays = Math.floor((nowDateOnly - chatDateOnly) / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) {
        return 'Today';
    } else if (diffInDays === 1) {
        return 'Yesterday';
    } else if (diffInDays <= 7) {
        return 'Previous 7 Days';
    } else if (diffInDays <= 30) {
        return 'Previous 30 Days';
    } else {
        return 'Older';
    }
}

// Endpoint to handle file uploads and extract content
app.post('/upload', upload.single('file'), async (req, res) => {
    const file = req.file;
    const chatId = req.body.chatId;

    if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!chatId) {
        return res.status(400).json({ error: 'Missing chatId' });
    }

    try {
        if (file.mimetype.startsWith('image/')) {
            // For images, you might handle differently or skip
            return res.status(200).json({ success: true });
        } else {
            let extractedText = '';
            if (file.mimetype === 'application/pdf') {
                const data = await pdfParse(file.buffer);
                extractedText = data.text;
            } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                const { value } = await mammoth.extractRawText({ buffer: file.buffer });
                extractedText = value;
            } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
                const workbook = xlsx.read(file.buffer, { type: 'buffer' });
                const sheetNames = workbook.SheetNames;
                sheetNames.forEach(sheetName => {
                    const sheet = workbook.Sheets[sheetName];
                    extractedText += xlsx.utils.sheet_to_csv(sheet) + '\n';
                });
            } else if (file.mimetype === 'text/plain') {
                extractedText = file.buffer.toString('utf-8');
            } else {
                return res.status(400).json({ error: 'Unsupported file type.' });
            }

            // Index the extracted text into AI Search
            const document = {
                chunk_id: `${chatId}_${Date.now()}`, // Unique ID as per index schema
                chunk: extractedText, // Content of the document
                title: file.originalname, // Title can be the original file name or another relevant identifier
                parent_id: chatId, // Associating the document with the chat session
                // text_vector: <Generate or omit based on your index requirements>,
                metadata: {
                    originalFileName: file.originalname,
                    mimeType: file.mimetype,
                    uploadedAt: new Date().toISOString(),
                    chatId: chatId,
                },
            };

            await indexDocumentToAISearch(document);

            let chat = await getChatHistory(chatId);

            if (!chat) {
                chat = {
                    id: chatId,
                    title: 'File Upload',
                    messages: [],
                    timestamp: new Date().toISOString(),
                };
            }

            // Optionally, store reference to the indexed document in chat
            if (!chat.indexedDocuments) {
                chat.indexedDocuments = [];
            }
            chat.indexedDocuments.push(document.id);

            // Upsert the chat document
            await upsertChatHistory(chat);

            res.status(200).json({ success: true });
        }
    } catch (error) {
        console.error('Error processing file:', error);
        res.status(500).json({ error: 'Failed to process the uploaded file.' });
    }
});

// Endpoint to handle user messages and interact with OpenAI
app.post('/chat', upload.single('image'), async (req, res) => {
    const { message, tutorMode } = req.body;
    const file = req.file;

    // Retrieve session secret from the session or use a default
    const sessionSecret = req.session.secret || 'defaultSecret';

    // If no chatId is provided in the request, generate one
    let { chatId } = req.body;
    if (!chatId) {
        const randomNumber = Math.random().toString(36).substr(2, 9);  // Generate a unique number
        chatId = `${sessionSecret}_chat_${randomNumber}`;  // Format: "secret_chat_number"
    }

    // Validate that either a message or file is present
    if (!message && !file) {
        return res.status(400).json({ error: 'Missing message or file' });
    }

    try {
        console.log(`Received message: "${message}" with Tutor Mode: ${tutorMode ? 'ON' : 'OFF'} and chatId: ${chatId}`);

        // Retrieve existing chat history or create a new one
        let chat = await getChatHistory(chatId);

        if (!chat) {
            const title = message ? message.slice(0, 50) : 'New Chat';
            chat = {
                id: chatId,
                title,
                messages: [],
                timestamp: new Date().toISOString(), // Chat creation timestamp
                total_tokens_used: 0,  // Initialize token counter
                total_interactions: 0, // Initialize interaction counter
                average_tokens_per_interaction: 0, // Initialize average token usage
            };
        }

        // Build messages array from existing chat history
        let messages = chat.messages.slice(-5).map(msg => ({
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
            tokens: msg.tokens // Keep the previous token counts
        }));

        // Handle document content if it exists in chat
        if (chat.documentContent) {
            messages.push({
                role: 'user',
                content: `Here is the document content:\n${chat.documentContent}`,
                timestamp: new Date().toISOString(),
            });
            delete chat.documentContent;  // Remove after processing
        }

        // Query AI Search for relevant documents based on the user's message
        let relevantDocuments = [];
        if (message) {
            relevantDocuments = await searchAI(message);
        }

        // Aggregate the content from relevant documents
        const aggregatedDocumentContent = relevantDocuments.map(doc => {
            let content = doc.chunk; // Use 'chunk' instead of 'content'
            const MAX_CONTENT_LENGTH = 1000; // Adjust as needed
        
            if (content.length > MAX_CONTENT_LENGTH) {
                content = content.substring(0, MAX_CONTENT_LENGTH) + '... [Content truncated]';
            }
        
            return `---\nDocument ID: ${doc.chunk_id}\nContent:\n${content}\n---`;
        }).join('\n');

        // Add system message with AI Search results
        const systemMessageContent = tutorMode
            ? 'You are an AI tutor. Please provide step-by-step explanations as if teaching the user.'
            : 'You are an assistant that can recall information from the provided documents to answer the user\'s queries.';

        const systemMessage = {
            role: 'system',
            content: `${systemMessageContent}\nNote that the following data is sourced from the AI Search system:\n${aggregatedDocumentContent}`,
            timestamp: new Date().toISOString(),
        };

        // Log the system message content
        console.log('System Message Content:');
        console.log(systemMessage.content);

        messages.unshift(systemMessage);

        // Add user message if present
        if (message) {
            messages.push({
                role: 'user',
                content: message,
                timestamp: new Date().toISOString(),
            });
        }

        // Handle image upload if present
        if (file && file.mimetype.startsWith('image/')) {
            const base64Image = file.buffer.toString('base64');
            const imageUrl = `data:${file.mimetype};base64,${base64Image}`;

            messages.push({
                role: 'user',
                content: [
                    {
                        "type": "text",
                        "text": message || 'Please analyze the following image:',
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": imageUrl,
                        },
                    },
                ],
                timestamp: new Date().toISOString(),
            });
        }

        // Prepare payload for OpenAI
        const payload = {
            model: 'gpt-4',
            messages: messages,
        };

        // Make API call to OpenAI
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
            throw new Error(`Error: ${response.statusText}`);
        }

        const data = await response.json();
        const aiResponse = data.choices[0].message.content;

        // Token information from the response
        const { prompt_tokens, completion_tokens, total_tokens } = data.usage;

        console.log('AI Response:', aiResponse);
        console.log(`Tokens used - Input: ${prompt_tokens}, Output: ${completion_tokens}, Total: ${total_tokens}`);

        // Append new user messages to chat history
        if (message) {
            chat.messages.push({
                role: 'user',
                content: message,
                timestamp: new Date().toISOString(),
                tokens: prompt_tokens, // Add input tokens for user message
            });
        }

        if (file && file.mimetype.startsWith('image/')) {
            chat.messages.push({
                role: 'user',
                content: [
                    {
                        "type": "text",
                        "text": message || 'Please analyze the following image:',
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": imageUrl,
                        },
                    },
                ],
                timestamp: new Date().toISOString(),
                tokens: prompt_tokens, // Add input tokens for image message
            });
        }

        // Add assistant's message with token count
        chat.messages.push({
            role: 'assistant',
            content: aiResponse,
            timestamp: new Date().toISOString(),
            tokens: completion_tokens, // Add output tokens for AI response
        });

        // Update overall token usage for the chat session
        chat.total_tokens_used += total_tokens;  // Accumulate total tokens used
        chat.total_interactions += 2;  // Each user message and assistant response counts as 2 interactions

        // Calculate the average tokens per interaction
        chat.average_tokens_per_interaction = chat.total_tokens_used / chat.total_interactions;

        // Update timestamp for the overall chat
        chat.timestamp = new Date().toISOString();

        // Upsert the chat document into Cosmos DB
        await upsertChatHistory(chat);

        // Categorize the chat based on timestamp
        const category = categorizeChat(chat.timestamp);

        res.json({
            response: aiResponse,
            chatId,
            category,
            tokens: total_tokens,
            average_tokens_per_interaction: chat.average_tokens_per_interaction,
        });
    } catch (error) {
        console.error('Error processing chat request:', error);
        res.status(500).json({ error: 'Something went wrong with OpenAI' });
    }
});

// Endpoint to get the list of chat sessions with categories
app.get('/chats', async (req, res) => {
    try {
        // Get session secret or default
        const sessionSecret = req.session.secret || 'defaultSecret';

        // Query for all chats
        const querySpec = {
            query: 'SELECT c.id, c.title, c.timestamp FROM c',
        };

        const { resources: chats } = await container.items.query(querySpec).fetchAll();

        const categorizedChats = {};

        // Filter chats that belong to the current session secret
        const filteredChats = chats.filter(chat => chat.id.startsWith(`${sessionSecret}_chat_`));

        // Categorize the chats based on date
        filteredChats.forEach(chat => {
            const category = categorizeChat(chat.timestamp);

            if (!categorizedChats[category]) {
                categorizedChats[category] = [];
            }

            categorizedChats[category].push({
                chatId: chat.id,
                title: chat.title,
            });
        });

        res.json(categorizedChats);
    } catch (error) {
        console.error('Error retrieving chats:', error);
        res.status(500).json({ error: 'Failed to retrieve chats' });
    }
});

// Endpoint to retrieve a specific chat history
app.get('/chats/:chatId', async (req, res) => {
    const { chatId } = req.params;

    try {
        const chat = await getChatHistory(chatId);

        if (chat) {
            res.json(chat);
        } else {
            res.status(404).json({ error: 'Chat not found' });
        }
    } catch (error) {
        console.error('Error retrieving chat:', error);
        res.status(500).json({ error: 'Failed to retrieve chat' });
    }
});

async function deleteOldChats() {
    try {
        const querySpec = {
            query: 'SELECT c.id, c.timestamp FROM c',
        };

        const { resources: chats } = await container.items.query(querySpec).fetchAll();

        const now = new Date();
        const ninetyDaysInMillis = 90 * 24 * 60 * 60 * 1000;  // 90 days in milliseconds

        for (const chat of chats) {
            const chatTimestamp = new Date(chat.timestamp);
            const ageInMillis = now - chatTimestamp;

            if (ageInMillis > ninetyDaysInMillis) {
                // Chat is older than 90 days, delete it
                await container.item(chat.id, chat.id).delete();
                console.log(`Deleted chat with ID: ${chat.id} because it is older than 90 days.`);
            }
        }
    } catch (error) {
        console.error('Error deleting old chats:', error);
    }
}

// Run the deletion check immediately on server start
deleteOldChats();

// Schedule the old chat deletion to run every 24 hours
setInterval(deleteOldChats, 24 * 60 * 60 * 1000); // Runs every 24 hours

// Start the server on the specified port
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});