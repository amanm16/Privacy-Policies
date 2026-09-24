'use strict';

// Read-only JSON for published policies, for apps that show the policy natively.

const express = require('express');
const config = require('../config');
const asyncHandler = require('../middleware/async-handler');
const policies = require('../services/policies');
const { renderContent } = require('../lib/content');
const { SLUG_PATTERN } = require('../../shared/slug');

const router = express.Router();

function absoluteUrl(req, path) {
  return (config.publicBaseUrl || req.protocol + '://' + req.get('host')) + path;
}

router.use('/policies', (req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'no-cache');
  next();
});

router.get('/policies', asyncHandler(async (req, res) => {
  const published = await policies.listPublished();
  res.json({
    policies: published.map((policy) => ({
      slug: policy.slug,
      appName: policy.appName,
      organization: policy.organization,
      effectiveDate: policy.effectiveDate,
      url: absoluteUrl(req, '/' + policy.slug),
    })),
  });
}));

router.get('/policies/:slug', asyncHandler(async (req, res) => {
  const slug = req.params.slug.toLowerCase();
  const policy = SLUG_PATTERN.test(slug) ? await policies.findPublishedBySlug(slug) : null;
  if (!policy) return res.status(404).json({ error: 'No published policy at /' + slug + '.' });
  const rendered = renderContent(policy.content);
  return res.json({
    policy: {
      slug: policy.slug,
      appName: policy.appName,
      organization: policy.organization,
      organizationDetails: policy.organizationDetails,
      summary: policy.summary,
      contactEmail: policy.contactEmail,
      effectiveDate: policy.effectiveDate,
      url: absoluteUrl(req, '/' + policy.slug),
      html: rendered.html,
      toc: rendered.toc,
      updatedAt: policy.updatedAt,
    },
  });
}));

module.exports = router;
