'use strict';

const config = require('../config');
const { renderNotFoundPage, renderErrorPage } = require('../views/message');

function wantsJson(req) {
  return req.originalUrl === '/api' || req.originalUrl.slice(0, 5) === '/api/';
}

function apiNotFound(req, res) {
  res.status(404).json({ error: 'There is no ' + req.method + ' ' + req.originalUrl.split('?')[0] + ' endpoint.' });
}

function pageNotFound(req, res) {
  res.status(404).send(String(renderNotFoundPage(config.showIndex)));
}

function fieldErrors(validationError) {
  const fields = {};
  for (const key of Object.keys(validationError.errors || {})) fields[key] = validationError.errors[key].message;
  return fields;
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  let status = err.status || err.statusCode || 500;
  let message = err.message;
  let details = err.details || {};
  if (err.type === 'entity.parse.failed') {
    status = 400;
    message = "The request body isn't valid JSON.";
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'The request is too large. The limit is 2 MB.';
  } else if (err.name === 'CastError') {
    status = 404;
    message = 'Not found.';
  } else if (err.code === 11000) {
    status = 409;
    message = 'That address is already used by another policy.';
    details = { fields: { slug: message } };
  } else if (err.name === 'ValidationError') {
    status = 400;
    message = 'Some fields need attention.';
    details = { fields: fieldErrors(err) };
  }

  if (status >= 500) {
    console.error('[error] ' + req.method + ' ' + req.originalUrl + '\n' + (err.stack || err));
    message = 'Something went wrong on the server.';
    details = {};
  }

  if (wantsJson(req)) return res.status(status).json(Object.assign({ error: message }, details));
  return res.status(status).send(String(status === 404 ? renderNotFoundPage(config.showIndex) : renderErrorPage()));
}

module.exports = { apiNotFound, pageNotFound, errorHandler };
