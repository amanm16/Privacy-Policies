'use strict';

// An error with an HTTP status. `details` is merged into the JSON error response
// (for example { fields: { slug: '...' } } so the admin can show it next to the field).
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details || {};
  }
}

module.exports = HttpError;
