'use strict';

// Serves the React admin (built into client/dist by `npm run build`).

const fs = require('fs');
const path = require('path');
const express = require('express');

const DIST = path.join(__dirname, '..', '..', 'client', 'dist');
const INDEX = path.join(DIST, 'index.html');

const router = express.Router();

router.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});

router.use('/assets', express.static(path.join(DIST, 'assets'), {
  index: false,
  immutable: true,
  maxAge: '1y',
  fallthrough: false,
}));

// Every other /admin path is a screen of the single-page app.
router.get('*', (req, res, next) => {
  fs.readFile(INDEX, 'utf8', (err, page) => {
    if (err && err.code === 'ENOENT') {
      return res.status(503).type('text/plain').send('The admin has not been built yet. Run "npm run build", then restart the server.');
    }
    if (err) return next(err);
    res.set('Cache-Control', 'no-cache');
    return res.type('html').send(page);
  });
});

module.exports = router;
