'use strict';

// Used by the server and bundled into the admin UI, so it must not use Node-only APIs.

// 1–64 characters: lowercase letters, digits and hyphens, not starting or ending with a hyphen.
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

// Top-level paths the site uses itself.
const RESERVED_SLUGS = ['admin', 'api', 'assets', 'healthz', 'login', 'logout', 'new', 'robots', 'static'];

function slugify(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 64)
    .replace(/-+$/, '');
}

// Returns a sentence explaining what is wrong with the slug, or null if it can be used.
function slugProblem(slug) {
  if (!slug) return 'Enter an address for this policy.';
  if (!SLUG_PATTERN.test(slug)) {
    return 'Use lowercase letters, numbers and hyphens, up to 64 characters (for example "my-app").';
  }
  if (RESERVED_SLUGS.indexOf(slug) !== -1) {
    return '"/' + slug + '" is used by the site itself. Choose another address.';
  }
  return null;
}

module.exports = { SLUG_PATTERN, RESERVED_SLUGS, slugify, slugProblem };
