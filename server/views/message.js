'use strict';

const { html } = require('../lib/html');
const { layout } = require('./layout');

function renderMessagePage(options) {
  const body = html`<div class="page page--narrow">
  <main id="policy" class="message">
    <p class="message__code">${options.code}</p>
    <h1 class="message__title">${options.title}</h1>
    <p class="message__text">${options.text}</p>
    ${options.link ? html`<p><a class="message__link" href="${options.link.href}">${options.link.label}</a></p>` : ''}
  </main>
</div>`;
  return layout({ title: options.title, robots: 'noindex', bodyClass: 'message-page', body });
}

function renderNotFoundPage(showIndex) {
  return renderMessagePage({
    code: '404',
    title: 'Policy not found',
    text: "There's no privacy policy at this address. If you followed a link from an app or a store listing, the app may use a different address.",
    link: showIndex ? { href: '/', label: 'See all policies' } : null,
  });
}

function renderErrorPage() {
  return renderMessagePage({
    code: '500',
    title: "This page couldn't be loaded",
    text: 'The server ran into a problem. Try again in a minute.',
  });
}

module.exports = { renderNotFoundPage, renderErrorPage };
