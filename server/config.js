'use strict';

const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const env = process.env;

function flag(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

function trustProxy(value) {
  if (value === undefined || value === '') return 'loopback';
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === 'true';
  if (/^\d+$/.test(value)) return Number(value);
  return value; // e.g. "loopback" or "10.0.0.0/8"
}

const config = {
  isProduction: env.NODE_ENV === 'production',
  port: Number(env.PORT) || 4000,
  host: env.HOST || undefined,
  mongoUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27017/privacy_policies',
  publicBaseUrl: (env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, ''),
  siteName: (env.SITE_NAME || '').trim() || 'Privacy Policies',
  showIndex: flag(env.SHOW_INDEX, true),
  sessionSecret: env.SESSION_SECRET || '',
  sessionSecretGenerated: false,
  sessionHours: 12,
  apiToken: (env.API_TOKEN || '').trim(),
  trustProxy: trustProxy(env.TRUST_PROXY),
};

// Outside production a missing secret is replaced with a random one (sessions end on restart).
if (!config.sessionSecret && !config.isProduction) {
  config.sessionSecret = crypto.randomBytes(32).toString('hex');
  config.sessionSecretGenerated = true;
}

// Problems that should stop the web server from starting.
config.problems = function problems() {
  const found = [];
  if (config.sessionSecret.length < 32) {
    found.push('SESSION_SECRET must be at least 32 random characters.');
  }
  if (config.apiToken && config.apiToken.length < 32) {
    found.push('API_TOKEN must be at least 32 characters, or empty to turn token access off.');
  }
  if (config.publicBaseUrl && !/^https?:\/\/[^/\s]+(\/\S*)?$/i.test(config.publicBaseUrl)) {
    found.push('PUBLIC_BASE_URL must be a full address such as https://privacy.example.com.');
  }
  return found;
};

module.exports = config;
