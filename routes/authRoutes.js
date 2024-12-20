const express = require('express');
const router = express.Router();
const { isDevelopment } = require('../services/authService');

if (isDevelopment()) {
    router.get('/login', (req, res) => {
        req.user = { userId: 'test-user-id', userDetails: 'Josh Serpis', userRoles: ['authenticated'] };
        res.redirect('/');
    });

    router.get('/logout', (req, res) => {
        req.user = null;
        res.redirect('/');
    });
} else {
    router.get('/login', (req, res) => res.redirect('/.auth/login/aad'));
    router.get('/logout', (req, res) => res.redirect('/.auth/logout'));
}

router.get('/user-info', (req, res) => {
    const userId = req.user.email;
    const userName = req.user.name || 'User';
    res.json({ userId, userName });
});

module.exports = router;
