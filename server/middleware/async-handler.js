'use strict';

// Express 4 doesn't catch rejected promises from handlers; this passes them to the error handler.
module.exports = function asyncHandler(fn) {
  return function handle(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
