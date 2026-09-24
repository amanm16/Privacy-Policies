'use strict';

const express = require('express');
const config = require('../config');
const db = require('../db');
const asyncHandler = require('../middleware/async-handler');
const policies = require('../services/policies');
const { renderPolicyPage } = require('../views/policy');
const { renderHomePage } = require('../views/home');
const { SLUG_PATTERN } = require('../../shared/slug');

const router = express.Router();

function canonicalUrl(path) {
  return config.publicBaseUrl ? config.publicBaseUrl + path : '';
}

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send('User-agent: *\nDisallow: /admin\nDisallow: /api/\n');
});

router.get('/healthz', (req, res) => {
  const up = db.isConnected();
  res.set('Cache-Control', 'no-store');
  res.status(up ? 200 : 503).json({ status: up ? 'ok' : 'unavailable', database: up ? 'connected' : 'disconnected' });
});

router.get('/', asyncHandler(async (req, res, next) => {
  if (!config.showIndex) return next();
  const published = await policies.listPublished();
  res.set('Cache-Control', 'no-cache');
  return res.send(String(renderHomePage(published, { siteName: config.siteName, canonicalUrl: canonicalUrl('/') })));
}));

// One app, one address: /<slug>. Old addresses, capital letters and a trailing slash all redirect
// to the current address, so a link pasted into a store listing keeps working.
router.get('/:slug', asyncHandler(async (req, res, next) => {
  const requested = req.params.slug;
  const slug = requested.toLowerCase();
  if (!SLUG_PATTERN.test(slug)) return next();

  const policy = await policies.findPublishedBySlug(slug);
  if (!policy) return next();

  if (policy.slug !== requested || req.path !== '/' + requested) {
    const queryAt = req.originalUrl.indexOf('?');
    return res.redirect(301, '/' + policy.slug + (queryAt === -1 ? '' : req.originalUrl.slice(queryAt)));
  }
  res.set('Cache-Control', 'no-cache');
  return res.send(String(renderPolicyPage(policy, { canonicalUrl: canonicalUrl('/' + policy.slug) })));
}));

module.exports = router;
