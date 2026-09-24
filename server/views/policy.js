'use strict';

const { html, raw } = require('../lib/html');
const { renderContent } = require('../lib/content');
const { formatLongDate, formatShortDate, isIsoDate } = require('../../shared/dates');
const { layout } = require('./layout');

// Pages with at least this many sections get a table of contents.
const CONTENTS_THRESHOLD = 4;

function contentsList(toc) {
  return html`<ul class="contents__list">${toc.map((item) => html`<li><a href="#${item.id}">${item.text}</a></li>`)}</ul>`;
}

// `policy` is a stored policy or unsaved fields from the admin preview (which may be incomplete).
function renderPolicyPage(policy, options) {
  const opts = options || {};
  const rendered = renderContent(policy.content || '');
  const appName = policy.appName || 'Untitled app';
  const operator = policy.organization || '';
  const details = policy.organizationDetails || '';
  const dated = isIsoDate(policy.effectiveDate);
  const year = dated ? policy.effectiveDate.slice(0, 4) : String(new Date().getUTCFullYear());
  const owner = [operator || appName, details].filter(Boolean).join(', ').replace(/\.$/, '');
  const showContents = rendered.toc.length >= CONTENTS_THRESHOLD;
  const description = policy.summary
    || 'How ' + appName + (operator ? ', operated by ' + operator + ',' : '') + ' collects, uses and protects your information.';

  const body = html`<a class="skip-link" href="#policy">Skip to the policy</a>
<div class="page${showContents ? ' page--with-contents' : ''}">
  <header class="masthead">
    <div class="masthead__text">
      <h1 class="masthead__title"><span class="masthead__kind">Privacy policy</span> <span class="masthead__app">${appName}</span></h1>
      ${operator ? html`<p class="masthead__operator">${operator}</p>` : ''}
      ${details ? html`<p class="masthead__details">${details}</p>` : ''}
    </div>
    ${dated ? html`<p class="stamp"><span class="stamp__label">Effective</span> <time class="stamp__date" datetime="${policy.effectiveDate}">${formatShortDate(policy.effectiveDate)}</time></p>` : ''}
  </header>
  ${showContents ? html`<nav class="contents contents--rail" aria-label="Contents">
    <p class="contents__title">Contents</p>
    ${contentsList(rendered.toc)}
  </nav>
  <details class="contents contents--inline">
    <summary class="contents__title">Contents <span class="contents__count">${rendered.toc.length} sections</span></summary>
    ${contentsList(rendered.toc)}
  </details>` : ''}
  <main id="policy" class="policy" tabindex="-1">
${raw(rendered.html)}
  </main>
  <footer class="colophon">
    ${dated ? html`<p>Effective ${formatLongDate(policy.effectiveDate)}.</p>` : ''}
    ${policy.contactEmail ? html`<p>Questions about this policy? Email <a href="mailto:${policy.contactEmail}">${policy.contactEmail}</a>.</p>` : ''}
    <p>&copy; ${year} ${owner}. All rights reserved.</p>
    ${opts.canonicalUrl ? html`<p class="colophon__address">${opts.canonicalUrl}</p>` : ''}
  </footer>
</div>`;

  return layout({
    title: appName + ' — Privacy Policy',
    description,
    canonical: opts.canonicalUrl,
    robots: opts.preview ? 'noindex' : '',
    bodyClass: 'policy-page',
    body,
  });
}

module.exports = { renderPolicyPage };
