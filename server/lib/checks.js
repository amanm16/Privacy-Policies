'use strict';

// Pre-publish checks. Placeholders block publishing: a live policy that still says
// "[COMPANY ADDRESS]" gets an app rejected and isn't a policy anyone can rely on.
// Everything else is advice, based on what App Store and Google Play reviewers look for.

const { describeContent } = require('./content');
const { todayIso, addDays } = require('../../shared/dates');

const PLACEHOLDER_PATTERNS = [
  // [HOSTING REGION], [GRIEVANCE OFFICER EMAIL]
  /\[(?=[^\]\n]*[A-Z])[A-Z0-9 _&/.,'’()-]{3,80}\]/g,
  // [Your company name], [insert date]
  /\[(?:your|insert|enter|add|company|app|developer|name|email|address|date|contact)\b[^\]\n]{0,80}\]/gi,
  // {{app_name}}
  /\{\{[^{}\n]{1,80}\}\}/g,
  // <YOUR EMAIL> typed as text
  /<(?:your|insert|enter)\b[^<>\n]{0,80}>/gi,
  /\b(?:TODO|TBD|FIXME)\b/g,
  /\blorem ipsum\b/gi,
];

const EMAIL_IN_TEXT = /[^\s@<>()[\]]+@[^\s@<>()[\]]+\.[a-z]{2,}/i;
const REAL_MAILTO = /^mailto:[^\s@[\]]+@[^\s@[\]]+\.[a-z]{2,}/i;

function findPlaceholders(values) {
  const found = [];
  for (const value of values) {
    if (!value) continue;
    for (const pattern of PLACEHOLDER_PATTERNS) {
      const matches = String(value).match(pattern) || [];
      for (const match of matches) {
        if (found.indexOf(match) === -1) found.push(match);
      }
    }
  }
  return found;
}

// -> { placeholders: [string], warnings: [{ code, message }], canPublish }
function reviewPolicy(policy) {
  const { text, links } = describeContent(policy.content || '');
  const placeholders = findPlaceholders([
    policy.appName, policy.organization, policy.organizationDetails, policy.summary, policy.contactEmail, text,
  ].concat(links));

  const warnings = [];
  const warn = (code, message) => warnings.push({ code, message });

  const hasContact = Boolean(policy.contactEmail)
    || links.some((link) => REAL_MAILTO.test(link) || /^tel:\+?\d/i.test(link))
    || EMAIL_IN_TEXT.test(text);
  if (!hasContact) {
    warn('contact', 'Add a contact email. Both stores expect a way to reach you about privacy.');
  }
  if (!/\b(delet\w*|eras(e|ure|ing)|remov(e|al) (of )?(your|their|the) (data|account|information))\b/i.test(text)) {
    warn('deletion', 'Explain how people can get their data deleted. Google Play checks for this.');
  }
  if (!/\b(child|children|minor|minors|kids)\b|under (the age of )?1[3-8]/i.test(text)) {
    warn('children', 'Say whether the app is meant for children, and how children’s data is handled.');
  }
  if (!/third[- ]part(y|ies)|service providers?|processors?|shar(e|ed|ing) (your |personal )?(data|information)|sdks?\b/i.test(text)) {
    warn('third-parties', 'Name the third-party services the app uses (analytics, sign-in, maps, crash reporting), or say there are none.');
  }
  if (policy.effectiveDate) {
    const today = todayIso();
    if (policy.effectiveDate < addDays(today, -365)) {
      warn('stale', 'The effective date is over a year old. Check the policy still matches what the app collects.');
    } else if (policy.effectiveDate > addDays(today, 1)) {
      warn('future', 'The effective date is in the future.');
    }
  }
  if (text.length > 0 && text.length < 1200) {
    warn('short', 'This policy is very short. Reviewers reject policies that don’t say what is collected, why, and who it is shared with.');
  }

  return { placeholders, warnings, canPublish: placeholders.length === 0 };
}

function placeholderMessage(placeholders) {
  const count = placeholders.length;
  return 'Replace ' + (count === 1 ? 'the placeholder ' : 'the ' + count + ' placeholders ') + 'before publishing: '
    + placeholders.slice(0, 5).join(', ') + (count > 5 ? ', …' : '') + '.';
}

module.exports = { reviewPolicy, findPlaceholders, placeholderMessage };
