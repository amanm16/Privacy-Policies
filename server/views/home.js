'use strict';

const { html } = require('../lib/html');
const { formatShortDate } = require('../../shared/dates');
const { layout } = require('./layout');

function renderHomePage(policies, options) {
  const body = html`<div class="page page--narrow">
  <header class="masthead masthead--home">
    <div class="masthead__text">
      <h1 class="masthead__title"><span class="masthead__app">${options.siteName}</span></h1>
      <p class="masthead__operator">Choose an app to read its privacy policy.</p>
    </div>
  </header>
  <main id="policy" class="register">
    ${policies.length
      ? html`<ul class="register__list">${policies.map((policy) => html`
      <li><a class="register__item" href="/${policy.slug}">
        <span class="register__app">${policy.appName}</span>
        <span class="register__operator">${policy.organization}</span>
        <span class="register__date">Effective ${formatShortDate(policy.effectiveDate)}</span>
      </a></li>`)}
    </ul>`
      : html`<p class="register__empty">No policies are published yet.</p>`}
  </main>
</div>`;

  return layout({
    title: options.siteName,
    description: 'Privacy policies for ' + policies.length + (policies.length === 1 ? ' app.' : ' apps.'),
    canonical: options.canonicalUrl,
    bodyClass: 'home-page',
    body,
  });
}

module.exports = { renderHomePage };
