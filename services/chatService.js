const { container } = require('../db/cosmosClient');
const NINETY_DAYS_IN_MS = 90 * 24 * 60 * 60 * 1000;

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
                console.log(`Updated chat with ID: ${chat.id} by deleting fields (older than 90 days).`);
            }
        }
    } catch (error) {
        console.error('Error deleting fields from old chats:', error);
    }
}

module.exports = {
    getChatHistory,
    upsertChatHistory,
    categorizeChat,
    deleteOldChats
};
