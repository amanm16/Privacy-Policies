'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');

const COOKIE_NAME = 'pp_session';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function cookieOptions(req) {
  return { httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/' };
}

function startSession(req, res, user) {
  const seconds = config.sessionHours * 3600;
  const token = jwt.sign({ v: user.sessionVersion }, config.sessionSecret, {
    algorithm: 'HS256',
    subject: String(user._id),
    expiresIn: seconds,
  });
  res.cookie(COOKIE_NAME, token, Object.assign(cookieOptions(req), { maxAge: seconds * 1000 }));
}

function endSession(req, res) {
  res.clearCookie(COOKIE_NAME, cookieOptions(req));
}

function sameSecret(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

// The admin UI marks its requests with this header. Browsers won't add a custom header to a
// cross-site request without CORS permission (which this server never grants), so requiring it
// on cookie-authenticated writes blocks cross-site request forgery.
function isAppRequest(req) {
  return req.get('x-requested-with') === 'fetch';
}

// Signed in with the admin session cookie, or (when API_TOKEN is set) "Authorization: Bearer <token>".
async function requireAuth(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    if (/^bearer\s/i.test(header)) {
      const token = header.replace(/^bearer\s+/i, '').trim();
      if (config.apiToken && sameSecret(token, config.apiToken)) {
        req.user = { id: null, email: 'api-token', viaToken: true };
        return next();
      }
      return res.status(401).json({ error: 'The API token is missing or wrong.' });
    }

    const token = req.cookies && req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Sign in to continue.' });

    let payload = null;
    try {
      payload = jwt.verify(token, config.sessionSecret, { algorithms: ['HS256'] });
    } catch (err) {
      payload = null;
    }
    const user = payload && /^[a-f0-9]{24}$/.test(payload.sub) ? await User.findById(payload.sub).lean() : null;
    if (!user || user.sessionVersion !== payload.v) {
      endSession(req, res);
      return res.status(401).json({ error: 'Your session has ended. Sign in again.' });
    }
    if (!SAFE_METHODS.has(req.method) && !isAppRequest(req)) {
      return res.status(403).json({ error: 'Changes must be made from the admin.' });
    }
    req.user = { id: String(user._id), email: user.email, viaToken: false };
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireAuth, startSession, endSession, isAppRequest, COOKIE_NAME };
