'use strict';

const mongoose = require('mongoose');
const { SLUG_PATTERN } = require('../../shared/slug');

const policySchema = new mongoose.Schema(
  {
    // The policy lives at /<slug>.
    slug: { type: String, required: true, unique: true, match: SLUG_PATTERN },
    // Addresses the policy had before. They redirect to the current one, so old links keep working.
    previousSlugs: { type: [String], default: [], index: true },

    appName: { type: String, required: true, maxlength: 120 },
    // Who operates the app (the data controller), and an optional second line such as a department.
    organization: { type: String, required: true, maxlength: 200 },
    organizationDetails: { type: String, default: '', maxlength: 300 },
    // Search-engine description.
    summary: { type: String, default: '', maxlength: 300 },
    contactEmail: { type: String, default: '', maxlength: 254 },
    // Calendar date, "YYYY-MM-DD".
    effectiveDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    // Cleaned HTML (see server/lib/content.js).
    content: { type: String, required: true },

    status: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
    publishedAt: { type: Date, default: null },

    // Admin-only: where the policy was hosted before, and notes for whoever edits it next.
    legacyUrl: { type: String, default: '', maxlength: 500 },
    internalNotes: { type: String, default: '', maxlength: 5000 },
    // Admin-only: the file this policy was last imported from (e.g. "Documents/HIRO — Privacy
    // Policy.html"), so an import whose title now suggests another address isn't guessed at.
    sourceFile: { type: String, default: '', index: true, maxlength: 300 },

    revision: { type: Number, default: 0 },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true },
);

module.exports = mongoose.models.Policy || mongoose.model('Policy', policySchema);
