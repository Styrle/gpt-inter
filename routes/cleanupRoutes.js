const express = require('express');
const router = express.Router();
const { deleteOldChats } = require('../services/chatService');

// Run old chat cleanup on startup and every 24 hours
deleteOldChats();
setInterval(deleteOldChats, 24 * 60 * 60 * 1000);

module.exports = router;
