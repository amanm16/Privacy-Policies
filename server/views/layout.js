'use strict';

const { html } = require('../lib/html');
const assets = require('../assets');

function layout(page) {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${page.title}</title>
${page.description ? html`<meta name="description" content="${page.description}">` : ''}
${page.canonical ? html`<link rel="canonical" href="${page.canonical}">` : ''}
${page.robots ? html`<meta name="robots" content="${page.robots}">` : ''}
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0e1016" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="preload" href="${assets.textFontHref}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${assets.stylesheetHref}">
</head>
<body class="${page.bodyClass || ''}">
${page.body}
</body>
</html>
`;
}

module.exports = { layout };
