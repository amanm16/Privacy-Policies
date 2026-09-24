'use strict';

const mongoose = require('mongoose');

// A copy of a policy's editable fields as they were after one save.
const revisionSchema = new mongoose.Schema(
  {
    policy: { type: mongoose.Schema.Types.ObjectId, ref: 'Policy', required: true },
    number: { type: Number, required: true },
    data: { type: Object, required: true },
    editedBy: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
);

revisionSchema.index({ policy: 1, number: -1 }, { unique: true });

module.exports = mongoose.models.Revision || mongoose.model('Revision', revisionSchema);
