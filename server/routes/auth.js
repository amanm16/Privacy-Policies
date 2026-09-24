'use strict';

const express = require('express');
const config = require('../config');
const User = require('../models/User');
const asyncHandler = require('../middleware/async-handler');
const { requireAuth, startSession, endSession, isAppRequest } = require('../middleware/auth');
const { verifyPassword, UNKNOWN_USER_HASH } = require('../lib/passwords');
const { createLimiter } = require('../lib/rate-limit');

const router = express.Router();

// 10 failed sign-ins per 15 minutes, counted per IP address and per email address.
const limiter = createLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });

function session(email) {
  return { user: { email }, publicBaseUrl: config.publicBaseUrl || null };
}

router.post('/login', asyncHandler(async (req, res) => {
  if (!isAppRequest(req)) return res.status(403).json({ error: 'Sign in from the admin page.' });

  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const keys = ['ip:' + req.ip, 'email:' + email];

  const wait = Math.max.apply(null, keys.map((key) => limiter.retryAfter(key)));
  if (wait) {
    const minutes = Math.ceil(wait / 60);
    res.set('Retry-After', String(wait));
    return res.status(429).json({ error: 'Too many sign-in attempts. Try again in ' + minutes + (minutes === 1 ? ' minute.' : ' minutes.') });
  }
  if (!email || !password) return res.status(400).json({ error: 'Enter your email and password.' });

  const user = await User.findOne({ email });
  const valid = await verifyPassword(password, user ? user.passwordHash : UNKNOWN_USER_HASH);
  if (!user || !valid) {
    keys.forEach((key) => limiter.fail(key));
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }

  keys.forEach((key) => limiter.reset(key));
  user.lastLoginAt = new Date();
  await user.save();
  startSession(req, res, user);
  return res.json(session(user.email));
}));

router.post('/logout', (req, res) => {
  endSession(req, res);
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => {
  res.json(session(req.user.email));
});

module.exports = router;
