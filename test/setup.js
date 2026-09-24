'use strict';

// Runs before any test file (see .mocharc.json), before server/config.js reads the environment.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/privacy_policies_test';
process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough-000000';
process.env.API_TOKEN = 'test-api-token-that-is-long-enough-00000000000';
process.env.PUBLIC_BASE_URL = 'https://privacy.example.test';
process.env.SHOW_INDEX = 'true';
process.env.TRUST_PROXY = 'loopback';
