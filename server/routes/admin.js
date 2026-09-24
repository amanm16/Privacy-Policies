'use strict';

const express = require('express');
const config = require('../config');
const Policy = require('../models/Policy');
const asyncHandler = require('../middleware/async-handler');
const { requireAuth } = require('../middleware/auth');
const policies = require('../services/policies');
const HttpError = require('../lib/http-error');
const { reviewPolicy } = require('../lib/checks');
const { importPolicyHtml } = require('../lib/importer');
const { renderPolicyPage } = require('../views/policy');
const { slugProblem } = require('../../shared/slug');

const router = express.Router();
router.use(requireAuth);

function editor(req) {
  return req.user.email;
}

function withReview(policy, extra) {
  return Object.assign({ policy: policies.toAdminJson(policy), review: reviewPolicy(policy) }, extra || {});
}

router.get('/policies', asyncHandler(async (req, res) => {
  const all = await policies.listPolicies();
  res.json({ policies: all.map(policies.toListItem) });
}));

router.post('/policies', asyncHandler(async (req, res) => {
  const result = await policies.createPolicy(req.body, editor(req));
  res.status(201).json(withReview(result.policy, { removed: result.removed }));
}));

router.get('/policies/:id', asyncHandler(async (req, res) => {
  res.json(withReview(await policies.findPolicy(req.params.id)));
}));

router.put('/policies/:id', asyncHandler(async (req, res) => {
  const result = await policies.updatePolicy(req.params.id, req.body, editor(req));
  res.json(withReview(result.policy, { removed: result.removed, changed: result.changed }));
}));

router.delete('/policies/:id', asyncHandler(async (req, res) => {
  await policies.deletePolicy(req.params.id);
  res.status(204).end();
}));

router.get('/policies/:id/revisions', asyncHandler(async (req, res) => {
  res.json({ revisions: await policies.listRevisions(req.params.id) });
}));

router.get('/policies/:id/revisions/:number', asyncHandler(async (req, res) => {
  res.json({ revision: await policies.getRevision(req.params.id, req.params.number) });
}));

// Reads a complete HTML page into policy fields.
// Body: { html, filename?, slug? } to preview what would be imported, plus save: true to store it
// (then publish: true publishes when no placeholders remain, overwrite: true updates the policy at
// that address; see saveImported).
router.post('/import', asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (typeof body.html !== 'string' || !body.html.trim()) throw new HttpError(400, 'Send the page as "html".');
  const imported = importPolicyHtml(body.html, { filename: typeof body.filename === 'string' ? body.filename : '' });
  const explicitSlug = typeof body.slug === 'string' && Boolean(body.slug.trim());
  if (explicitSlug) imported.fields.slug = body.slug.trim().toLowerCase();

  if (body.save === true) {
    if (slugProblem(imported.fields.slug)) {
      throw new HttpError(400, 'Some fields need attention.', { fields: { slug: slugProblem(imported.fields.slug) }, notes: imported.notes });
    }
    const result = await policies.saveImported(imported.fields, {
      publish: body.publish === true,
      overwrite: body.overwrite === true,
      explicitSlug,
      sourceFile: typeof body.filename === 'string' ? body.filename.trim().slice(0, 300) : '',
      editor: editor(req),
    });
    return res.status(result.action === 'created' ? 201 : 200).json(withReview(result.policy, {
      action: result.action,
      addressKept: Boolean(result.addressKept),
      takenOffline: Boolean(result.takenOffline),
      notes: imported.notes,
    }));
  }

  const existing = imported.fields.slug
    ? await Policy.findOne({ slug: imported.fields.slug }).select('slug appName status').lean()
    : null;
  return res.json({
    fields: imported.fields,
    notes: imported.notes,
    removed: imported.removed,
    review: reviewPolicy(imported.fields),
    existing: existing ? { id: String(existing._id), slug: existing.slug, appName: existing.appName, status: existing.status } : null,
  });
}));

// Renders unsaved fields exactly as the public page would, for the editor's live preview.
router.post('/preview', asyncHandler(async (req, res) => {
  const { values, removed } = policies.readFields(req.body);
  const draft = Object.assign({}, policies.BLANK, values);
  const canonicalUrl = config.publicBaseUrl && !slugProblem(draft.slug) ? config.publicBaseUrl + '/' + draft.slug : '';
  res.json({
    html: String(renderPolicyPage(draft, { preview: true, canonicalUrl })),
    content: draft.content,
    review: reviewPolicy(draft),
    removed,
  });
}));

module.exports = router;
