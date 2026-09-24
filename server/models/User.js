'use strict';

const mongoose = require('mongoose');

// Admin accounts. Created and managed with `npm run user` (see scripts/manage-users.js).
const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    // Bumped when the password changes, which ends the user's sessions everywhere.
    sessionVersion: { type: Number, default: 1 },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
