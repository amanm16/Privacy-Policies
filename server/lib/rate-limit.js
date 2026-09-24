'use strict';

// Counts failed attempts per key in memory. Suits the single Node process this app runs as;
// with several processes each would keep its own count.
function createLimiter(options) {
  const limit = options.limit;
  const windowMs = options.windowMs;
  const entries = new Map();

  function sweep(now) {
    for (const [key, entry] of entries) {
      if (entry.resetAt <= now) entries.delete(key);
    }
  }

  return {
    // Seconds until `key` may try again; 0 if it may try now.
    retryAfter(key) {
      const entry = entries.get(key);
      const now = Date.now();
      if (!entry || entry.resetAt <= now || entry.count < limit) return 0;
      return Math.ceil((entry.resetAt - now) / 1000);
    },
    fail(key) {
      const now = Date.now();
      if (entries.size > 10000) sweep(now);
      const entry = entries.get(key);
      if (!entry || entry.resetAt <= now) entries.set(key, { count: 1, resetAt: now + windowMs });
      else entry.count += 1;
    },
    reset(key) {
      entries.delete(key);
    },
  };
}

module.exports = { createLimiter };
