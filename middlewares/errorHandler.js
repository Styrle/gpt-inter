function errorHandler(err, req, res, next) {
    console.error(err.stack);
    res.status(500).json({ error: 'An internal error occurred.' });
}

module.exports = { errorHandler };
