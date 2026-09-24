'use strict';

// Everything that reads or changes policies goes through here: the admin API, the public pages and
// the import script. Rules enforced on every save:
//   - content is cleaned (see lib/content.js), so nothing unsafe is stored;
//   - addresses are unique, including addresses a policy used before (they keep redirecting);
//   - a policy with placeholders left in it can't be published;
//   - each save that changes something is kept as a numbered revision.

const Policy = require('../models/Policy');
const Revision = require('../models/Revision');
const HttpError = require('../lib/http-error');
const { cleanContent } = require('../lib/content');
const { reviewPolicy, placeholderMessage } = require('../lib/checks');
const { slugProblem } = require('../../shared/slug');
const { isIsoDate } = require('../../shared/dates');

const FIELDS = [
  'slug', 'appName', 'organization', 'organizationDetails', 'summary', 'contactEmail',
  'effectiveDate', 'content', 'status', 'legacyUrl', 'internalNotes',
];

const BLANK = {
  slug: '', appName: '', organization: '', organizationDetails: '', summary: '', contactEmail: '',
  effectiveDate: '', content: '', status: 'draft', legacyUrl: '', internalNotes: '',
};

const MAX_LENGTH = {
  slug: 64, appName: 120, organization: 200, organizationDetails: 300, summary: 300,
  contactEmail: 254, effectiveDate: 10, status: 20, legacyUrl: 500, internalNotes: 5000, content: 500000,
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Reads editable fields from a request body. Unknown keys are ignored and missing ones left out, so
// updates can be partial.
function readFields(body) {
  const source = body && typeof body === 'object' ? body : {};
  const values = {};
  const errors = {};
  let removed = [];

  for (const key of FIELDS) {
    const value = source[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string') {
      errors[key] = 'This must be text.';
      continue;
    }
    if (key === 'content') {
      if (value.length > MAX_LENGTH.content * 2) {
        errors.content = 'The policy text is too long.';
        continue;
      }
      const cleaned = cleanContent(value);
      values.content = cleaned.html;
      removed = cleaned.removed;
    } else if (key === 'internalNotes') {
      values.internalNotes = value.trim();
    } else {
      values[key] = value.replace(/\s+/g, ' ').trim();
    }
  }
  if (values.slug !== undefined) values.slug = values.slug.toLowerCase();
  if (values.contactEmail !== undefined) values.contactEmail = values.contactEmail.toLowerCase();
  if (values.status !== undefined) values.status = values.status.toLowerCase();

  return { values, errors, removed };
}

function validationErrors(policy) {
  const errors = {};
  const slugIssue = slugProblem(policy.slug);
  if (slugIssue) errors.slug = slugIssue;
  if (!policy.appName) errors.appName = "Enter the app's name.";
  if (!policy.organization) errors.organization = 'Enter who operates the app.';
  if (!isIsoDate(policy.effectiveDate)) errors.effectiveDate = 'Enter the date this policy takes effect.';
  if (!policy.content) errors.content = 'Add the policy text.';
  if (policy.contactEmail && !EMAIL.test(policy.contactEmail)) {
    errors.contactEmail = 'Enter an email address, or leave this empty.';
  }
  if (policy.legacyUrl && !/^https?:\/\/\S+$/i.test(policy.legacyUrl)) {
    errors.legacyUrl = 'Enter a full address starting with https://, or leave this empty.';
  }
  if (policy.status !== 'draft' && policy.status !== 'published') errors.status = 'Choose draft or published.';
  for (const key of Object.keys(MAX_LENGTH)) {
    if (typeof policy[key] === 'string' && policy[key].length > MAX_LENGTH[key]) {
      errors[key] = 'Keep this under ' + MAX_LENGTH[key] + ' characters.';
    }
  }
  return errors;
}

function throwIfInvalid(errors) {
  if (Object.keys(errors).length) throw new HttpError(400, 'Some fields need attention.', { fields: errors });
}

function snapshot(policy) {
  const out = {};
  for (const key of FIELDS) {
    const value = policy[key];
    out[key] = value === undefined || value === null ? BLANK[key] : value;
  }
  return out;
}

async function assertSlugAvailable(slug, ownId) {
  const clash = await Policy.findOne({ _id: { $ne: ownId }, $or: [{ slug }, { previousSlugs: slug }] })
    .select('slug appName')
    .lean();
  if (!clash) return;
  const message = clash.slug === slug
    ? '/' + slug + ' is already used by ' + clash.appName + '.'
    : '/' + slug + ' used to be the address of ' + clash.appName + ' and still redirects there. Choose another.';
  throw new HttpError(409, message, { fields: { slug: message } });
}

function assertPublishable(policy) {
  const review = reviewPolicy(policy);
  if (policy.status === 'published' && !review.canPublish) {
    const message = placeholderMessage(review.placeholders);
    throw new HttpError(422, message, { placeholders: review.placeholders, fields: { status: message } });
  }
  return review;
}

async function recordRevision(policy, editor) {
  try {
    await Revision.create({ policy: policy._id, number: policy.revision, data: snapshot(policy), editedBy: editor || '' });
  } catch (err) {
    console.error('[revisions] Could not save revision ' + policy.revision + ' of /' + policy.slug + ': ' + err.message);
  }
}

async function findPolicy(id) {
  const policy = await Policy.findById(id);
  if (!policy) throw new HttpError(404, 'No policy with that id.');
  return policy;
}

async function createPolicy(body, editor) {
  const { values, errors, removed } = readFields(body);
  const data = Object.assign({}, BLANK, values);
  throwIfInvalid(Object.assign(validationErrors(data), errors));
  await assertSlugAvailable(data.slug, null);
  const review = assertPublishable(data);

  const policy = new Policy(Object.assign({}, data, {
    revision: 1,
    updatedBy: editor || '',
    publishedAt: data.status === 'published' ? new Date() : null,
  }));
  await policy.save();
  await recordRevision(policy, editor);
  return { policy, review, removed, changed: true };
}

// `target` is a policy id or an already-loaded policy document.
async function updatePolicy(target, body, editor) {
  const policy = target instanceof Policy ? target : await findPolicy(target);
  const { values, errors, removed } = readFields(body);
  const before = snapshot(policy);
  const data = Object.assign({}, before, values);
  throwIfInvalid(Object.assign(validationErrors(data), errors));
  if (data.slug !== policy.slug) await assertSlugAvailable(data.slug, policy._id);
  const review = assertPublishable(data);

  if (FIELDS.every((key) => before[key] === data[key])) {
    return { policy, review, removed, changed: false };
  }
  if (data.slug !== policy.slug) {
    const kept = policy.previousSlugs.filter((slug) => slug !== data.slug && slug !== policy.slug);
    policy.previousSlugs = kept.concat(policy.slug);
  }
  if (data.status === 'published' && policy.status !== 'published') policy.publishedAt = new Date();
  Object.assign(policy, data);
  policy.revision += 1;
  policy.updatedBy = editor || '';
  await policy.save();
  await recordRevision(policy, editor);
  return { policy, review, removed, changed: true };
}

async function deletePolicy(id) {
  const policy = await findPolicy(id);
  if (policy.status === 'published') {
    throw new HttpError(409, 'Unpublish this policy before deleting it. Its address may still be in a store listing.');
  }
  await Revision.deleteMany({ policy: policy._id });
  await policy.deleteOne();
}

async function listPolicies() {
  return Policy.find().sort({ updatedAt: -1 }).lean();
}

async function listRevisions(id) {
  const policy = await findPolicy(id);
  const revisions = await Revision.find({ policy: policy._id })
    .sort({ number: -1 })
    .select('number editedBy createdAt data.status data.effectiveDate')
    .lean();
  return revisions.map((revision) => ({
    number: revision.number,
    editedBy: revision.editedBy,
    createdAt: revision.createdAt,
    status: revision.data.status,
    effectiveDate: revision.data.effectiveDate,
  }));
}

async function getRevision(id, number) {
  const policy = await findPolicy(id);
  const revision = /^\d+$/.test(String(number))
    ? await Revision.findOne({ policy: policy._id, number: Number(number) }).lean()
    : null;
  if (!revision) throw new HttpError(404, 'No version ' + number + ' of this policy.');
  return { number: revision.number, editedBy: revision.editedBy, createdAt: revision.createdAt, data: revision.data };
}

async function rememberSourceFile(policy, sourceFile) {
  if (!sourceFile || policy.sourceFile === sourceFile) return;
  policy.sourceFile = sourceFile;
  await policy.save();
}

// Saves fields read from an HTML file, treating the file as the source of the policy.
//   - The address is what ties a file to its policy: the explicit `slug` given with the import, or
//     else the one the file's title suggests. A policy renamed in the admin is still found through
//     its old address, and keeps its new one. Existing policies are only changed with `overwrite`.
//   - If the title now suggests a new address but this file (`sourceFile`) was imported before
//     under another, nothing is guessed: the import is refused until an address is given.
//   - The file's public details replace the stored ones, so a line deleted from the file
//     disappears from the page. Admin-only notes are kept when the file has none.
//   - `publish` publishes new policies and drafts that were never live, unless placeholders remain.
//     A policy someone took offline stays offline until it is published again in the admin.
async function saveImported(fields, options) {
  const opts = options || {};
  const existing = await Policy.findOne({ $or: [{ slug: fields.slug }, { previousSlugs: fields.slug }] });
  if (!existing && !opts.explicitSlug && opts.sourceFile) {
    const earlier = await Policy.findOne({ sourceFile: opts.sourceFile }).select('slug').lean();
    if (earlier && earlier.slug !== fields.slug) {
      const message = '"' + opts.sourceFile + '" was imported before as /' + earlier.slug + ', but its title now suggests /'
        + fields.slug + '. Give the address: /' + earlier.slug + ' to update that policy, or /' + fields.slug + ' to create a new one.';
      throw new HttpError(409, message, { fields: { slug: message }, suggestions: [earlier.slug, fields.slug] });
    }
  }
  if (existing && !opts.overwrite) {
    return { action: 'skipped', policy: existing, review: reviewPolicy(existing), changed: false };
  }

  const body = Object.assign({}, fields);
  if (existing) body.slug = existing.slug;
  const review = reviewPolicy(body);
  const takenOffline = Boolean(existing && existing.status === 'draft' && existing.publishedAt);
  if (opts.publish && review.canPublish && !takenOffline) body.status = 'published';
  else body.status = existing ? existing.status : 'draft';

  if (!existing) {
    const created = await createPolicy(body, opts.editor);
    await rememberSourceFile(created.policy, opts.sourceFile);
    return Object.assign({ action: 'created', addressKept: false }, created);
  }
  for (const key of ['legacyUrl', 'internalNotes']) {
    if (!body[key]) delete body[key];
  }
  const result = await updatePolicy(existing, body, opts.editor);
  await rememberSourceFile(result.policy, opts.sourceFile);
  return Object.assign({
    action: result.changed ? 'updated' : 'unchanged',
    // The policy was renamed in the admin; the file's address now redirects to it.
    addressKept: fields.slug !== existing.slug,
    takenOffline,
  }, result);
}

function findPublishedBySlug(slug) {
  return Policy.findOne({ status: 'published', $or: [{ slug }, { previousSlugs: slug }] }).lean();
}

function listPublished() {
  return Policy.find({ status: 'published' })
    .select('slug appName organization effectiveDate')
    .collation({ locale: 'en' })
    .sort({ appName: 1 })
    .lean();
}

function toAdminJson(policy) {
  const p = typeof policy.toObject === 'function' ? policy.toObject() : policy;
  return {
    id: String(p._id),
    slug: p.slug,
    previousSlugs: p.previousSlugs || [],
    appName: p.appName,
    organization: p.organization,
    organizationDetails: p.organizationDetails || '',
    summary: p.summary || '',
    contactEmail: p.contactEmail || '',
    effectiveDate: p.effectiveDate,
    content: p.content,
    status: p.status,
    publishedAt: p.publishedAt || null,
    legacyUrl: p.legacyUrl || '',
    internalNotes: p.internalNotes || '',
    sourceFile: p.sourceFile || '',
    revision: p.revision,
    updatedBy: p.updatedBy || '',
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function toListItem(policy) {
  const review = reviewPolicy(policy);
  return {
    id: String(policy._id),
    slug: policy.slug,
    appName: policy.appName,
    organization: policy.organization,
    status: policy.status,
    effectiveDate: policy.effectiveDate,
    updatedAt: policy.updatedAt,
    updatedBy: policy.updatedBy || '',
    placeholders: review.placeholders.length,
    warnings: review.warnings.length,
  };
}

module.exports = {
  BLANK,
  readFields,
  createPolicy,
  updatePolicy,
  deletePolicy,
  findPolicy,
  listPolicies,
  listRevisions,
  getRevision,
  saveImported,
  findPublishedBySlug,
  listPublished,
  toAdminJson,
  toListItem,
};
