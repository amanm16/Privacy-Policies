'use strict';

const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);

const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;

// Stored as "scrypt$N$r$p$salt$key" (base64 salt and key).
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, { N: COST, r: BLOCK_SIZE, p: PARALLELISM });
  return ['scrypt', COST, BLOCK_SIZE, PARALLELISM, salt.toString('base64'), key.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const expected = Buffer.from(parts[5], 'base64');
  const key = await scrypt(String(password), Buffer.from(parts[4], 'base64'), expected.length, {
    N: Number(parts[1]),
    r: Number(parts[2]),
    p: Number(parts[3]),
  });
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

// Checked against when the email is unknown, so a wrong email takes as long as a wrong password.
const UNKNOWN_USER_HASH = ['scrypt', COST, BLOCK_SIZE, PARALLELISM, Buffer.alloc(16).toString('base64'), Buffer.alloc(KEY_LENGTH).toString('base64')].join('$');

function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 12) return 'Use at least 12 characters.';
  if (password.length > 200) return 'Use at most 200 characters.';
  return null;
}

module.exports = { hashPassword, verifyPassword, passwordProblem, UNKNOWN_USER_HASH };
