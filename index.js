'use strict';

// Privacy policies and support pages for M16 Labs apps, for their App Store and Google Play listings.
//
// Every .html file in policies/ is one app's privacy policy, and every .html file in support/ is one
// app's support page. The file name is the app's address:
//   policies/hiro.html  ->  /hiro
//   support/hiro.html   ->  /hiro/support
// The files are served as they are, with a site bar added at the top (a link to every app, and the
// app's other pages). The home page (/) lists the apps under the store each is published on
// (STORES below). Adding a page is just adding its file: no database, nothing to configure. An app
// missing from STORES still shows up, under "Other apps".
//
// Run:     node index.js     (listens on 127.0.0.1:25001; public at https://privacypolicies.metahos.com)
// Deploy:  pm2 start index.js --name privacypolicies

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = 25001;
const HOST = '127.0.0.1';
const SITE_URL = 'https://privacypolicies.metahos.com';

const POLICIES = path.join(__dirname, 'policies');
const SUPPORT = path.join(__dirname, 'support');
const ASSETS = path.join(__dirname, 'assets');
const STYLESHEET = path.join(ASSETS, 'site.css');

// A page's file name is its app's address: lowercase letters, digits and hyphens, then ".html".
const PAGE_FILE = /^([a-z0-9-]+)\.html$/;

// The pages an app can have, in the order the site lists them.
const KINDS = [
  { dir: POLICIES, suffix: '', label: 'Privacy policy' },
  { dir: SUPPORT, suffix: '/support', label: 'Support' },
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

// The site's mark: the favicon's stamped card, drawn in the text colour.
const MARK = '<svg class="site-bar__mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">'
  + '<g transform="rotate(-8 16 16)" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">'
  + '<rect x="3.5" y="7" width="25" height="18" rx="4"/><path d="M9.5 14h13M9.5 18.5h8"/></g></svg>';

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function decodeEntities(text) {
  const names = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
  return text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name) => names[name]);
}

// The text inside the first match of pattern, without tags or extra spaces.
function textOf(html, pattern) {
  const match = pattern.exec(html);
  return match ? decodeEntities(match[1].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim() : '';
}

// What the site shows about a page, read from its HTML: the app's name (its <title> without
// "— Privacy Policy" or "— Support"), who runs the app, and the date a policy took effect.
function readPage(file) {
  const html = fs.readFileSync(file, 'utf8');
  const date = /<time class="stamp__date" datetime="([^"]*)">([^<]*)<\/time>/.exec(html);
  return {
    name: textOf(html, /<title>([\s\S]*?)<\/title>/i)
      .replace(/\s*[—–|:-]\s*(?:privacy\s+policy|support)$/i, '')
      .replace(/^(?:privacy\s+policy|support)\s*(?:for\s+|[—–|:-]\s*)/i, '')
      .trim(),
    operator: textOf(html, /<p class="masthead__operator">([\s\S]*?)<\/p>/),
    effective: date ? { iso: date[1], text: decodeEntities(date[2]).trim() } : null,
  };
}

function readDir(dir) {
  try {
    return fs.readdirSync(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function byName(a, b) {
  return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
}

// Every app with at least one page, read from the folders on every visit, so a new file shows up
// without a restart. The name and operator come from the privacy policy when there is one.
function listApps() {
  const apps = {};
  KINDS.forEach((kind) => {
    readDir(kind.dir).forEach((name) => {
      const match = PAGE_FILE.exec(name);
      if (!match) return;
      const slug = match[1];
      const info = readPage(path.join(kind.dir, name));
      const app = apps[slug] || (apps[slug] = { slug, name: '', operator: '', pages: [] });
      app.name = app.name || info.name;
      app.operator = app.operator || info.operator;
      app.pages.push({ kind, href: '/' + slug + kind.suffix, effective: info.effective });
    });
  });
  return Object.keys(apps).map((slug) => Object.assign(apps[slug], { name: apps[slug].name || slug })).sort(byName);
}

// The stores in STORES, then any app that isn't in one; empty sections are left out.
function homeSections(apps) {
  const listed = {};
  const sections = STORES.map((store) => {
    store.apps.forEach((slug) => { listed[slug] = true; });
    return { title: store.name, note: store.platform, apps: apps.filter((app) => store.apps.indexOf(app.slug) !== -1) };
  });
  sections.push({ title: 'Other apps', note: '', apps: apps.filter((app) => !listed[app.slug]) });
  return sections.filter((section) => section.apps.length);
}

// ---- Stylesheet fingerprint and caching ----

let stylesheet = { mtime: 0, version: '' };

// A fingerprint of the stylesheet's contents, recomputed when the file changes. Pages link to
// /assets/site.css?v=<fingerprint>, so browsers can keep it for a year and still fetch the new
// one the moment it changes, without a restart.
function stylesheetVersion() {
  const mtime = fs.statSync(STYLESHEET).mtimeMs;
  if (mtime !== stylesheet.mtime) {
    const version = crypto.createHash('sha1').update(fs.readFileSync(STYLESHEET)).digest('hex').slice(0, 10);
    stylesheet = { mtime, version };
  }
  return stylesheet.version;
}

function stylesheetHref() {
  return '/assets/site.css?v=' + stylesheetVersion();
}

function assetCache(file, query) {
  if (file !== STYLESHEET) return 'public, max-age=2592000';
  const version = /(?:^|&)v=([^&]*)/.exec(query);
  return version && version[1] === stylesheetVersion() ? 'public, max-age=31536000, immutable' : 'no-cache';
}

// ---- Pages ----

// The bar across the top of every page: the site's name, linking to the home page, and the
// current app's pages, when it has more than one.
function siteBar(app, current, wide) {
  const links = app && app.pages.length > 1 ? `
    <ul class="site-bar__pages" aria-label="${escapeHtml(app.name)}">
${app.pages.map((page) => `      <li><a class="site-bar__page" href="${page.href}"${page.href === current ? ' aria-current="page"' : ''}>${page.kind.label}</a></li>`).join('\n')}
    </ul>` : '';
  return `<nav class="site-bar${wide ? ' site-bar--wide' : ''}" aria-label="Site">
  <div class="site-bar__inner">
    <a class="site-bar__home" href="/"${current === '/' ? ' aria-current="page"' : ''}>${MARK}<span class="site-bar__name">M16 Labs</span><span class="site-bar__section">Privacy policies</span></a>${links}
  </div>
</nav>
`;
}

// A policy or support file as served: its stylesheet link fingerprinted, and the site bar added
// right after its skip link (or at the top of <body>). The file itself is never changed.
function decorate(html, app, current) {
  const bar = siteBar(app, current, /\bpage--with-contents\b/.test(html));
  const styled = html.replace(/href="\/assets\/site\.css(?:\?[^"]*)?"/g, () => `href="${stylesheetHref()}"`);
  const anchor = /<a class="skip-link"[^>]*>[\s\S]*?<\/a>\n?/.test(styled) ? /<a class="skip-link"[^>]*>[\s\S]*?<\/a>\n?/ : /<body[^>]*>\n?/;
  return styled.replace(anchor, (match) => match + bar);
}

function page(title, head, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${head}<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0e1016" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/atkinson-hyperlegible-next-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${stylesheetHref()}">
</head>
${body}
</html>
`;
}

function docLink(page) {
  const date = page.effective
    ? ` <span class="doc__date">Effective <time datetime="${escapeHtml(page.effective.iso)}">${escapeHtml(page.effective.text)}</time></span>`
    : '';
  return `          <li><a class="doc" href="${page.href}"><span class="doc__label">${page.kind.label}</span>`
    + `<span class="doc__meta"><span class="doc__path">${page.href}</span>${date}</span></a></li>`;
}

function entry(app) {
  const operator = app.operator ? `\n          <p class="entry__operator">${escapeHtml(app.operator)}</p>` : '';
  return `      <li class="entry">
        <div class="entry__app">
          <h3 class="entry__name">${escapeHtml(app.name)}</h3>${operator}
        </div>
        <ul class="entry__docs">
${app.pages.map(docLink).join('\n')}
        </ul>
      </li>`;
}

function homePage(apps) {
  const sections = homeSections(apps).map((section) => {
    const id = 'store-' + section.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const note = section.note ? ` <span class="store__platform">${escapeHtml(section.note)}</span>` : '';
    return `  <section class="store" aria-labelledby="${id}">
    <h2 class="store__title" id="${id}">${escapeHtml(section.title)}${note}</h2>
    <ul class="register">
${section.apps.map(entry).join('\n')}
    </ul>
  </section>`;
  }).join('\n');
  return page('Privacy policies — M16 Labs', `<meta name="description" content="Privacy policies and support pages for the apps M16 Labs builds.">
<link rel="canonical" href="${SITE_URL}/">
`, `<body class="home-page">
${siteBar(null, '/', false)}<div class="page">
  <header class="masthead masthead--home">
    <div class="masthead__text">
      <h1 class="masthead__title"><span class="masthead__app">Privacy policies</span></h1>
      <p class="home-lede">Privacy policies and support pages for the apps M16 Labs builds, as linked from their App Store and Google Play listings.</p>
    </div>
  </header>
  <main class="stores">
${sections || '    <p class="home-empty">No policies yet.</p>'}
  </main>
</div>
</body>`);
}

function notFoundPage(apps) {
  const list = apps.map((app) => `      <li><span class="message__app">${escapeHtml(app.name)}</span>`
    + app.pages.map((page) => ` <a href="${page.href}">${page.kind.label}</a>`).join('') + '</li>').join('\n');
  const pages = apps.length ? `
    <h2 class="message__subtitle">Pages on this site</h2>
    <ul class="message__list">
${list}
    </ul>` : '';
  return page('Page not found — M16 Labs', '<meta name="robots" content="noindex">\n', `<body class="message-page">
${siteBar(null, null, false)}<div class="page">
  <main class="message">
    <p class="message__code">404</p>
    <h1 class="message__title">Page not found</h1>
    <p class="message__text">There's no privacy policy or support page at this address. If you followed a link from an app or a store listing, the app may use a different address.</p>${pages}
  </main>
</div>
</body>`);
}

// ---- Responses ----

function sendHtml(res, status, html) {
  res.writeHead(status, {
    'Content-Type': TYPES['.html'],
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(html);
}

function sendNotFound(res) {
  sendHtml(res, 404, notFoundPage(listApps()));
}

function sendPage(res, file, app, current) {
  fs.readFile(file, 'utf8', (err, html) => {
    if (err) return sendNotFound(res);
    return sendHtml(res, 200, decorate(html, app, current));
  });
}

function sendAsset(res, file, query) {
  fs.readFile(file, (err, body) => {
    if (err) return sendNotFound(res);
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': assetCache(file, query),
      'X-Content-Type-Options': 'nosniff',
    });
    return res.end(body);
  });
}

http.createServer((req, res) => {
  const [pathname, query = ''] = req.url.split('?');
  // /HIRO and /hiro/ show the same page as /hiro.
  const route = pathname.replace(/\/+$/, '').toLowerCase() || '/';
  try {
    if (route === '/') return sendHtml(res, 200, homePage(listApps()));

    const match = /^\/([a-z0-9-]+)(\/[a-z0-9-]+)?$/.exec(route);
    const kind = match && KINDS.find((k) => k.suffix === (match[2] || ''));
    if (kind) {
      const app = listApps().find((a) => a.slug === match[1]);
      const found = app && app.pages.find((p) => p.kind === kind);
      if (found) return sendPage(res, path.join(kind.dir, match[1] + '.html'), app, found.href);
      return sendNotFound(res);
    }

    if (pathname.indexOf('/assets/') === 0) {
      const file = path.join(ASSETS, pathname.slice('/assets/'.length));
      // Only files inside assets/, never anything above it.
      if (file.indexOf(ASSETS + path.sep) === 0) return sendAsset(res, file, query);
    }
    return sendNotFound(res);
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Something went wrong.');
  }
}).listen(PORT, HOST, () => {
  console.log('Privacy policies: http://' + HOST + ':' + PORT);
});
