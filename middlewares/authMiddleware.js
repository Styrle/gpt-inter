const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { isDevelopment } = require('../services/authService');

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
            }
            req.user = user;
            return next();
        } catch (error) {
            console.error('Error parsing x-ms-client-principal header:', error);
            return next();
        }
    } else {
        // Attempt to fetch from /.auth/me in production
        if (!isDevelopment()) {
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
                    }
                }
            } catch (error) {
                console.error('Error fetching /.auth/me:', error);
            }
        }
        next();
    }
}

async function ensureAuthenticated(req, res, next) {
    try {
        if (req.user && req.user.email) {
            return next();
        }

        if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.status(401).json({ error: 'Unauthorized' });
        } else if (isDevelopment()) {
            req.user = {
                email: 'JSerpis@delta.kaplaninc.com',
                name: 'Josh Serpis',
                userRoles: ['authenticated'],
            };
            return next();
        } else {
            return res.redirect('/login');
        }
    } catch (error) {
        console.error('Error in ensureAuthenticated middleware:', error);
        return next(error);
    }
}

module.exports = {
    getUserInfo,
    ensureAuthenticated
};
