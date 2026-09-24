'use strict';

// Privacy policies and support pages for M16 Labs apps, for their App Store and Google Play listings.
//
// Every .html file in policies/ is one app's privacy policy, and every .html file in support/ is one
// app's support page. The file name is the app's address:
//   policies/hiro.html  ->  /hiro
//   support/hiro.html   ->  /hiro/support
// The home page (/) lists the apps under the store each is published on (STORES below), with a
// button for each of its pages. Adding a page is just adding its file: no database, nothing to
// configure. An app missing from STORES still shows up, under "Other apps".
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
const SUPPORT = path.join(__dirname, 'support');
const ASSETS = path.join(__dirname, 'assets');

// A page's file name is its app's address: lowercase letters, digits and hyphens, then ".html".
const PAGE_FILE = /^([a-z0-9-]+)\.html$/;

// The pages an app can have, in the order its card on the home page lists them.
const KINDS = [
  { dir: POLICIES, suffix: '', label: 'Privacy policy', one: 'privacy policy', many: 'privacy policies' },
  { dir: SUPPORT, suffix: '/support', label: 'Support', one: 'support page', many: 'support pages' },
];

// The home page's sections: each app under the store it is published on. An app on both stores
// goes in both lists.
const STORES = [
  { name: 'App Store', platform: 'iOS', apps: ['hiro'] },
  { name: 'Google Play', platform: 'Android', apps: ['dbocwwb', 'kbocwwb'] },
];

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

// An app's name: a page's <title> without "— Privacy Policy" or "— Support" ("HIRO — Support" -> "HIRO").
function appName(file) {
  const match = /<title>([^<]*)<\/title>/i.exec(fs.readFileSync(file, 'utf8'));
  const title = match ? decodeEntities(match[1]).replace(/\s+/g, ' ').trim() : '';
  return title
    .replace(/\s*[—–|:-]\s*(?:privacy\s+policy|support)$/i, '')
    .replace(/^(?:privacy\s+policy|support)\s*(?:for\s+|[—–|:-]\s*)/i, '')
    .trim();
}

function readDir(dir) {
  try {
    return fs.readdirSync(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

// Every app with at least one page, read from the folders on every visit, so a new file shows up
// without a restart. The name comes from the privacy policy when there is one.
function listApps() {
  const apps = {};
  KINDS.forEach((kind) => {
    readDir(kind.dir).forEach((name) => {
      const match = PAGE_FILE.exec(name);
      if (!match) return;
      const slug = match[1];
      const app = apps[slug] || (apps[slug] = { slug, name: '', pages: [] });
      app.name = app.name || appName(path.join(kind.dir, name));
      app.pages.push({ kind, href: '/' + slug + kind.suffix });
    });
  });
  return Object.keys(apps).map((slug) => Object.assign(apps[slug], { name: apps[slug].name || slug }));
}

// The stores in STORES, then any app that isn't in one; empty sections are left out.
function homeSections(apps) {
  const byName = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
  const listed = {};
  const sections = STORES.map((store) => {
    store.apps.forEach((slug) => { listed[slug] = true; });
    return { title: store.name, note: store.platform, apps: apps.filter((app) => store.apps.indexOf(app.slug) !== -1).sort(byName) };
  });
  sections.push({ title: 'Other apps', note: '', apps: apps.filter((app) => !listed[app.slug]).sort(byName) });
  return sections.filter((section) => section.apps.length);
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

function appCard(app) {
  const links = app.pages.map((page) => `          <li><a class="app-card__link" href="${page.href}">`
    + `<span class="app-card__label">${page.kind.label}</span> <span class="app-card__path">${page.href}</span></a></li>`).join('\n');
  return `      <li class="app-card">
        <h3 class="app-card__name">${escapeHtml(app.name)}</h3>
        <ul class="app-card__pages">
${links}
        </ul>
      </li>`;
}

function homePage(apps) {
  const counts = KINDS.map((kind) => {
    const count = apps.filter((app) => app.pages.some((page) => page.kind === kind)).length;
    return count ? `<span class="home-count">${count}</span> ${count === 1 ? kind.one : kind.many}` : '';
  }).filter(Boolean).join('<span class="home-sep" aria-hidden="true"> · </span>');
  const sections = homeSections(apps).map((section) => {
    const id = 'store-' + section.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const note = section.note ? ` <span class="store__platform">${escapeHtml(section.note)}</span>` : '';
    return `  <section class="store" aria-labelledby="${id}">
    <h2 class="store__title" id="${id}">${escapeHtml(section.title)}${note}</h2>
    <ul class="app-cards">
${section.apps.map(appCard).join('\n')}
    </ul>
  </section>`;
  }).join('\n');
  return page('Privacy Policies', `<meta name="description" content="Privacy policies and support pages for ${apps.length} ${apps.length === 1 ? 'app' : 'apps'}.">
<link rel="canonical" href="${SITE_URL}/">
`, `<body class="home-page">
<div class="page page--narrow">
  <header class="masthead masthead--home">
    <div class="masthead__text">
      <h1 class="masthead__title"><span class="masthead__app">Privacy Policies</span></h1>
      <p class="masthead__operator">${counts || 'No pages yet'}</p>
    </div>
  </header>
  <main class="stores">
${sections || '    <p class="home-empty">No policies yet.</p>'}
  </main>
</div>
</body>`);
}

function notFoundPage() {
  return page('Page not found', '<meta name="robots" content="noindex">\n', `<body class="message-page">
<div class="page page--narrow">
  <main class="message">
    <p class="message__code">404</p>
    <h1 class="message__title">Page not found</h1>
    <p class="message__text">There's no privacy policy or support page at this address. If you followed a link from an app or a store listing, the app may use a different address.</p>
    <p><a class="message__link" href="/">See all apps</a></p>
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
    if (route === '/') return sendHtml(res, 200, homePage(listApps()));

    const match = /^\/([a-z0-9-]+)(\/[a-z0-9-]+)?$/.exec(route);
    const kind = match && KINDS.find((k) => k.suffix === (match[2] || ''));
    if (kind) return sendFile(res, path.join(kind.dir, match[1] + '.html'));

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
