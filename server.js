const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 5000;

// Versioned assets (`?v=…`) are immutable: their content only changes when the query
// string does, so they can be cached for a year. The HTML shell is always revalidated
// so a new deploy is picked up immediately.
// GitHub Pages cannot send custom headers; the service worker covers repeat visits there.
const ONE_YEAR_IN_SECONDS = 31536000;

app.use((req, res, next) => {
    if (req.query && req.query.v) {
        res.setHeader('Cache-Control', `public, max-age=${ONE_YEAR_IN_SECONDS}, immutable`);
    } else if (/\.html(\?|$)/.test(req.path)) {
        res.setHeader('Cache-Control', 'no-cache');
    } else if (/\.(js|css)$/.test(req.path)) {
        res.setHeader('Cache-Control', 'no-cache');
    }
    next();
});

// Serve static files from current directory
app.use(express.static(__dirname));

// Serve main route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`KanjiWidgets server running on port ${PORT}`);
});
