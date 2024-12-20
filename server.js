require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const path = require('path');
const { isDevelopment } = require('./services/authService');
const { authMiddleware, getUserInfo, ensureAuthenticated } = require('./middlewares/authMiddleware');
const { errorHandler } = require('./middlewares/errorHandler');

const app = express();
const port = 8080;

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

// Authentication handling
if (isDevelopment()) {
    // Mock dev auth
    app.use((req, res, next) => {
        req.user = {
            email: 'JSerpis@delta.kaplaninc.com',
            name: 'Josh Serpis',
            userRoles: ['authenticated'],
        };
        next();
    });
} else {
    app.use(getUserInfo);
    app.use(ensureAuthenticated);
}

// Routes
const chatRoutes = require('./routes/chatRoutes');
const authRoutes = require('./routes/authRoutes');
const cleanupRoutes = require('./routes/cleanupRoutes');

app.use(chatRoutes);
app.use(authRoutes);
app.use(cleanupRoutes);

// Debug middleware
app.use((req, res, next) => {
    console.log('Authenticated user:', req.user);
    next();
});

// Error handler
app.use(errorHandler);

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});