'use strict';

// Privacy policies for M16 Labs apps, for their App Store and Google Play listings.
//
// Every .html file in policies/ is one policy, served at its file name:
//   policies/hiro.html  ->  /hiro
// The home page (/) shows how many there are and a button for each. Adding a policy is just
// adding its file: no code change, no database, nothing to configure.
//
// Run:     node index.js     (listens on 127.0.0.1:25001; public at https://privacypolicies.metahos.com)
// Deploy:  pm2 start index.js --name privacypolicies

const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = 25001;
const HOST = '127.0.0.1';
const SITE_URL = 'https://privacypolicies.metahos.com';

const POLICIES = path.join(__dirname, 'policies');
const ASSETS = path.join(__dirname, 'assets');

// A policy's file name is its address: lowercase letters, digits and hyphens, then ".html".
const POLICY_FILE = /^([a-z0-9-]+)\.html$/;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function decodeEntities(text) {
  const names = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
  return text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name) => names[name]);
}

// A button's label: the page's <title> without "— Privacy Policy" ("HIRO — Privacy Policy" -> "HIRO").
function appName(file, slug) {
  const match = /<title>([^<]*)<\/title>/i.exec(fs.readFileSync(file, 'utf8'));
  const title = match ? decodeEntities(match[1]).replace(/\s+/g, ' ').trim() : '';
  return title
    .replace(/\s*[—–|:-]\s*privacy\s+policy$/i, '')
    .replace(/^privacy\s+policy\s*(?:for\s+|[—–|:-]\s*)/i, '')
    .trim() || slug;
}

// The policies, read from the folder on every visit, so a new file shows up without a restart.
function listPolicies() {
  return fs.readdirSync(POLICIES)
    .map((name) => POLICY_FILE.exec(name))
    .filter(Boolean)
    .map((match) => ({ slug: match[1], name: appName(path.join(POLICIES, match[0]), match[1]) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}

function page(title, head, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${head}<meta name="color-scheme" content="light dark">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/site.css">
</head>
${body}
</html>
`;
}

function homePage(policies) {
  const count = policies.length;
  const buttons = policies.map((policy) => `    <a class="policy-button" href="/${policy.slug}">
      <span class="policy-button__name">${escapeHtml(policy.name)}</span>
      <span class="policy-button__path">/${policy.slug}</span>
    </a>`).join('\n');
  return page('Privacy Policies', `<meta name="description" content="Privacy policies for ${count} apps.">
<link rel="canonical" href="${SITE_URL}/">
`, `<body class="home-page">
<div class="page page--narrow">
  <header class="masthead masthead--home">
    <div class="masthead__text">
      <h1 class="masthead__title"><span class="masthead__app">Privacy Policies</span></h1>
      <p class="masthead__operator"><span class="home-count">${count}</span> ${count === 1 ? 'privacy policy' : 'privacy policies'}</p>
    </div>
  </header>
  <main class="policy-buttons">
${count ? buttons : '    <p class="home-empty">No policies yet.</p>'}
  </main>
</div>
</body>`);
}

function notFoundPage() {
  return page('Policy not found', '<meta name="robots" content="noindex">\n', `<body class="message-page">
<div class="page page--narrow">
  <main class="message">
    <p class="message__code">404</p>
    <h1 class="message__title">Policy not found</h1>
    <p class="message__text">There's no privacy policy at this address. If you followed a link from an app or a store listing, the app may use a different address.</p>
    <p><a class="message__link" href="/">See all policies</a></p>
  </main>
</div>
</body>`);
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': TYPES['.html'], 'X-Content-Type-Options': 'nosniff' });
  res.end(html);
}

function sendFile(res, file) {
  fs.readFile(file, (err, body) => {
    if (err) return sendHtml(res, 404, notFoundPage());
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.end(body);
  });
}

http.createServer((req, res) => {
  const pathname = req.url.split('?')[0];
  // /HIRO and /hiro/ show the same page as /hiro.
  const route = pathname.replace(/\/+$/, '').toLowerCase() || '/';
  try {
    if (route === '/') return sendHtml(res, 200, homePage(listPolicies()));

    const policy = /^\/([a-z0-9-]+)$/.exec(route);
    if (policy) return sendFile(res, path.join(POLICIES, policy[1] + '.html'));

    if (pathname.indexOf('/assets/') === 0) {
      const file = path.join(ASSETS, pathname.slice('/assets/'.length));
      // Only files inside assets/, never anything above it.
      if (file.indexOf(ASSETS + path.sep) === 0) return sendFile(res, file);
    }
    return sendHtml(res, 404, notFoundPage());
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Something went wrong.');
  }
}).listen(PORT, HOST, () => {
  console.log('Privacy policies: http://' + HOST + ':' + PORT);
});
