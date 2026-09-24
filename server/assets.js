'use strict';

// Static files for the public pages. The stylesheet is theme.css (fonts and colours, shared with
// the admin) followed by site.css, served as one fingerprinted file so browsers can cache it for a
// year and still pick up changes immediately.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

const PUBLIC_DIR = path.join(__dirname, 'public');

const stylesheet = ['theme.css', 'site.css']
  .map((file) => fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8'))
  .join('\n');
const version = crypto.createHash('sha1').update(stylesheet).digest('hex').slice(0, 10);

function middleware() {
  const router = express.Router();
  router.get('/site.css', (req, res) => {
    res.set('Cache-Control', req.query.v === version ? 'public, max-age=31536000, immutable' : 'no-cache');
    res.type('css').send(stylesheet);
  });
  router.use(express.static(PUBLIC_DIR, { index: false, maxAge: '30d', fallthrough: false }));
  return router;
}

module.exports = {
  middleware,
  stylesheetHref: '/assets/site.css?v=' + version,
  textFontHref: '/assets/fonts/atkinson-hyperlegible-next-latin-wght-normal.woff2',
};
