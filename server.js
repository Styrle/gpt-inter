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
const helmet = require('helmet');
const textract = require('textract');
const { htmlToText } = require('html-to-text');
const mime = require('mime-types');
const removeMarkdown = require('remove-markdown');



// Load environment variables from .env file
dotenv.config();

const app = express();
const port = 8080;

const upload = multer({ storage: multer.memoryStorage() });

const openai = new OpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
});

function getUserInfo(req, res, next) {
    const header = req.headers['x-ms-client-principal'];
    if (header) {
        try {
            const buffer = Buffer.from(header, 'base64');
            const user = JSON.parse(buffer.toString('ascii'));

            // Extract email from claims
            if (user && user.claims) {
                const emailClaim = user.claims.find(claim => claim.typ === 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress');
                if (emailClaim) {
                    user.email = emailClaim.val;
                } else {
                    console.error('Email claim not found in user claims');
                }

                const nameClaim = user.claims.find(claim => 
                    claim.typ === 'name' || 
                    claim.typ === 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'
                );
                if (nameClaim) {
                    user.name = nameClaim.val;
                }

                // You can also extract other claims as needed
            } else {
                console.error('User claims not found');
            }

            req.user = user;
        } catch (error) {
            console.error('Error parsing x-ms-client-principal header:', error);
        }
    } else {
        console.error('x-ms-client-principal header not found');
    }
    next();
}

app.use(getUserInfo);



function ensureAuthenticated(req, res, next) {
    if (req.user) {
      return next();
    }
  
    // Check for AJAX request
    if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
      res.status(401).json({ error: 'Unauthorized' });
    } else {
      if (process.env.NODE_ENV === 'development') {
        // In development, simulate authentication
        req.user = {
          userId: 'test-user-id',
          userDetails: 'Test User',
          userRoles: ['authenticated'],
        };
        return next();
      } else {
        // In production, redirect to login
        res.redirect('/login');
      }
    }
  }

app.use(session({
    secret: process.env.SESSION_SECRET || 'defaultSecret2',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // Cookie expiration
    },
}));

app.get('/session-secret', (req, res) => {
    res.json({ secret: req.user ? req.user.displayName : 'Not authenticated' });
});

app.use(express.json());
app.use(express.static('public'));

const client = new CosmosClient({
    endpoint: process.env.COSMOS_DB_ENDPOINT,
    key: process.env.COSMOS_DB_KEY,
});

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'", "https://login.microsoftonline.com"],
            scriptSrc: ["'self'", "https://login.microsoftonline.com"],
            connectSrc: ["'self'", "https://login.microsoftonline.com"],
      },
    },
  }));

// Get a reference to the database and container
const database = client.database(process.env.COSMOS_DB_DATABASE_ID);
const container = database.container(process.env.COSMOS_DB_CONTAINER_ID);

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
app.post('/upload', upload.single('file'), ensureAuthenticated, async (req, res) => {
    const file = req.file;
    const chatId = req.body.chatId;

    // Get userId from the authenticated user
    const userId = req.user && req.user.email ? req.user.email : 'anonymous';

    if (!req.user || !req.user.email) {
        console.error('User not authenticated or email not found');
        return res.status(401).json({ error: 'User not authenticated' });
    }


    if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!chatId) {
        return res.status(400).json({ error: 'Missing chatId' });
    }

    // Validate that the chatId belongs to the current user
    if (!chatId.startsWith(`${userId}_chat_`)) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    try {
        let extractedText = '';

        if (file.mimetype.startsWith('image/')) {
            // Use tesseract.js to extract text from the image
            const { data: { text } } = await tesseract.recognize(file.buffer);
            extractedText = text;
        } else {
            // Existing code for handling other file types
            const extension = path.extname(file.originalname).toLowerCase();
            const mimetype = mime.lookup(extension) || file.mimetype;

            // Extract text based on file type
            if (mimetype === 'application/pdf' || extension === '.pdf') {
                const data = await pdfParse(file.buffer);
                extractedText = data.text;
            } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || extension === '.docx') {
                const { value } = await mammoth.extractRawText({ buffer: file.buffer });
                extractedText = value;
            } else if (mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || extension === '.xlsx') {
                const workbook = xlsx.read(file.buffer, { type: 'buffer' });
                const sheetNames = workbook.SheetNames;
                sheetNames.forEach(sheetName => {
                    const sheet = workbook.Sheets[sheetName];
                    extractedText += xlsx.utils.sheet_to_csv(sheet) + '\n';
                });
            } else if (mimetype === 'text/plain' || extension === '.txt') {
                extractedText = file.buffer.toString('utf-8');
            } else if (mimetype === 'text/markdown' || extension === '.md') {
                const markdownContent = file.buffer.toString('utf-8');
                extractedText = removeMarkdown(markdownContent);
            } else if (mimetype === 'text/html' || extension === '.html' || extension === '.htm') {
                const htmlContent = file.buffer.toString('utf-8');
                extractedText = htmlToText(htmlContent, {
                    wordwrap: 130,
                });
            } else if (mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || extension === '.pptx') {
                extractedText = await new Promise((resolve, reject) => {
                    textract.fromBufferWithMime(file.mimetype, file.buffer, function (error, text) {
                        if (error) {
                            reject(error);
                        } else {
                            resolve(text);
                        }
                    });
                });
            } else {
                return res.status(400).json({ error: 'Unsupported file type.' });
            }
        }

        let chat = await getChatHistory(chatId);

        if (!chat) {
            chat = {
                id: chatId,
                title: 'File Upload',
                messages: [],
                timestamp: new Date().toISOString(),
                total_document_count: 0,  // Initialize document count
                total_document_size: 0,   // Initialize document size
            };
        }

        // Initialize document tracking fields if they don't exist
        if (typeof chat.total_document_count !== 'number') {
            chat.total_document_count = 0;
        }
        if (typeof chat.total_document_size !== 'number') {
            chat.total_document_size = 0;
        }

        // Increment the document count
        chat.total_document_count += 1;

        // Add the document size to the total
        chat.total_document_size += file.size || 0;

        // Optionally, store the size of the individual document in the message history
        chat.messages.push({
            role: 'user',
            content: `Uploaded a document: ${file.originalname}`,
            timestamp: new Date().toISOString(),
            tokens: 0, // Assuming no tokens for this message
            documentSize: file.size || 0, // Store individual document size
        });

        // Store the extracted text in the chat document
        if (!chat.documentContent) {
            chat.documentContent = extractedText;
        } else {
            // Append the new extracted text to existing content
            chat.documentContent += '\n' + extractedText;
        }

        // Upsert the chat document
        await upsertChatHistory(chat);

        res.status(200).json({ success: true });

    } catch (error) {
        console.error('Error processing file:', error);
        res.status(500).json({ error: 'Failed to process the uploaded file.' });
    }
});



// Endpoint to handle user messages and interact with OpenAI
app.post('/chat', upload.single('image'), ensureAuthenticated, async (req, res) => {
    const { message, tutorMode } = req.body;
    const file = req.file;

    // Get userId from the authenticated user
    const userId = req.user && req.user.email ? req.user.email : 'anonymous';

    // If no chatId is provided in the request, generate one
    let { chatId } = req.body;
    if (!chatId) {
        const randomNumber = Math.random().toString(36).substr(2, 9);  // Generate a unique number
        chatId = `${userId}_chat_${randomNumber}`;  // Format: "userId_chat_number"
    }

    // Validate that either a message or file is present
    if (!message && !file) {
        return res.status(400).json({ error: 'Missing message or file' });
    }

    try {
        console.log(`Received message: "${message}" with Tutor Mode: ${tutorMode ? 'ON' : 'OFF'} and chatId: ${chatId}`);

        // Retrieve existing chat history or create a new one
        let chat = await getChatHistory(chatId);

        let isNewChat = false;
        if (!chat) {
            isNewChat = true;
            chat = {
                id: chatId,
                title: 'New Chat', // Temporary title
                messages: [],
                timestamp: new Date().toISOString(), // Chat creation timestamp
                total_tokens_used: 0,  // Initialize token counter
                total_interactions: 0, // Initialize interaction counter
                average_tokens_per_interaction: 0, // Initialize average token usage
                total_image_count: 0, // Initialize image count
                total_image_size: 0, // Initialize total image size
                total_document_count: 0, // Initialize document count
                total_document_size: 0, // Initialize document size
            };
        }

        // Initialize document tracking fields if they don't exist
        if (typeof chat.total_document_count !== 'number') {
            chat.total_document_count = 0;
        }
        if (typeof chat.total_document_size !== 'number') {
            chat.total_document_size = 0;
        }

        // Build messages array from existing chat history
        let messages = chat.messages.slice(-5).map(msg => ({
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
            tokens: msg.tokens // Keep the previous token counts
        }));

        // Add system message
        const systemMessage = {
            role: 'system',
            content: tutorMode
                ? 'You are an AI tutor. Please provide step-by-step explanations as if teaching the user.'
                : 'You are an assistant that remembers all previous interactions in this chat and can recall them when asked.',
            timestamp: new Date().toISOString(),
        };
        messages.unshift(systemMessage);

        // Add user message if present and not an image
        if (message && (!file || !file.mimetype.startsWith('image/'))) {
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

            // Initialize image tracking fields if they don't exist
            if (typeof chat.total_image_count !== 'number') {
                chat.total_image_count = 0;
            }
            if (typeof chat.total_image_size !== 'number') {
                chat.total_image_size = 0;
            }

            // Increment the image count
            chat.total_image_count += 1;

            // Add the image size to the total
            chat.total_image_size += file.size || 0;

            // Optionally, you can store the size of the individual image in the message history if needed
            chat.messages.push({
                role: 'user',
                content: message || 'Sent an image',
                timestamp: new Date().toISOString(),
                tokens: 0, // Assuming no tokens for image message
                imageSize: file.size || 0, // Store individual image size
            });
        }

        // Handle document content if it exists in chat
        if (chat.documentContent) {
            messages.push({
                role: 'user',
                content: `Here is the document content:\n${chat.documentContent}`,
                timestamp: new Date().toISOString(),
            });
            // Do not delete chat.documentContent; let it persist across messages
        }

        // Prepare payload for OpenAI
        const payload = {
            model: 'gpt-4o',
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

        // Append new user messages to chat history without image data
        if (message && (!file || !file.mimetype.startsWith('image/'))) {
            chat.messages.push({
                role: 'user',
                content: message,
                timestamp: new Date().toISOString(),
                tokens: prompt_tokens, // Add input tokens for user message
            });
        }

        if (file && file.mimetype.startsWith('image/')) {
            // Do not include image data in chat history
            chat.messages.push({
                role: 'user',
                content: message || 'Sent an image',
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

        // If this is a new chat, generate a title
        if (isNewChat) {
            // Generate chat title using OpenAI
            const titlePrompt = [
                { role: 'system', content: 'You are an assistant that generates concise titles for conversations. The title should be 5 words or less and capture the essence of the conversation.' },
                { role: 'user', content: message }
            ];

            // Prepare payload for OpenAI
            const titlePayload = {
                model: 'gpt-4o',
                messages: titlePrompt,
            };

            // Make API call to OpenAI
            const titleResponse = await fetch(`${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}/chat/completions?api-version=${process.env.AZURE_OPENAI_API_VERSION}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': process.env.AZURE_OPENAI_API_KEY,
                },
                body: JSON.stringify(titlePayload),
            });

            if (!titleResponse.ok) {
                const errorText = await titleResponse.text();
                console.error('Error from OpenAI API when generating title:', errorText);
                // Proceed without updating the title
            } else {
                const titleData = await titleResponse.json();
                const generatedTitle = titleData.choices[0].message.content.trim();
                // Update the chat's title
                chat.title = generatedTitle;
            }
        }

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
            total_image_count: chat.total_image_count,
            total_image_size: chat.total_image_size,
            total_document_count: chat.total_document_count,
            total_document_size: chat.total_document_size,
        });
    } catch (error) {
        console.error('Error processing chat request:', error);
        res.status(500).json({ error: 'Something went wrong with OpenAI' });
    }
});

// Endpoint to get the list of chat sessions with categories
app.get('/chats', ensureAuthenticated, async (req, res) => {
    try {
        // Get userId from the authenticated user
        const userId = req.user && req.user.userDetails ? req.user.userDetails : 'Anonymous';

        // Query for all chats
        const querySpec = {
            query: 'SELECT c.id, c.title, c.timestamp FROM c',
        };

        const { resources: chats } = await container.items.query(querySpec).fetchAll();

        const categorizedChats = {};

        // Filter chats that belong to the current user
        const filteredChats = chats.filter(chat => chat.id.startsWith(`${userId}_chat_`));

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

const isDevelopment = process.env.NODE_ENV === 'development';

if (isDevelopment) {
  // Mock authentication middleware for development
  app.use((req, res, next) => {
    req.user = {
      userId: 'test-user-id',
      userDetails: 'Test User',
      userRoles: ['authenticated'],
    };
    next();
  });
} else {
  // Use the getUserInfo middleware in production
  app.use(getUserInfo);
}

// Endpoint to retrieve a specific chat history
app.get('/chats/:chatId', ensureAuthenticated, async (req, res) => {
    const { chatId } = req.params;
    const userId = req.user && req.user.userDetails ? req.user.userDetails : 'Anonymous';

    // Check if the chatId belongs to the current user
    if (!chatId.startsWith(`${userId}_chat_`)) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

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

if (isDevelopment) {
    // Mock /login route for development
    app.get('/login', (req, res) => {
      // Simulate login by setting req.user
      req.user = {
        userId: 'test-user-id',
        userDetails: 'Test User',
        userRoles: ['authenticated'],
      };
      res.redirect('/');
    });
  
    // Mock /logout route for development
    app.get('/logout', (req, res) => {
      // Simulate logout by clearing req.user
      req.user = null;
      res.redirect('/');
    });
  } else {
    // Production routes
    app.get('/login', (req, res) => {
      res.redirect('/.auth/login/aad');
    });
  
    app.get('/logout', (req, res) => {
      res.redirect('/.auth/logout');
    });
  }

  app.get('/user-info', ensureAuthenticated, (req, res) => {
    const userId = req.user && req.user.email ? req.user.email : 'anonymous';
    res.json({ userId });
});

app.use((req, res, next) => {
    console.log('Authenticated user:', req.user);
    next();
});

// Start the server on the specified port
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
