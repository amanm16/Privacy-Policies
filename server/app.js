'use strict';

const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const config = require('./config');
const assets = require('./assets');
const publicRoutes = require('./routes/public');
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const adminUi = require('./routes/admin-ui');
const { apiNotFound, pageNotFound, errorHandler } = require('./middleware/errors');

// Public pages load nothing but their own stylesheet, fonts and images.
const publicPolicy = helmet.contentSecurityPolicy({
  useDefaults: false,
  directives: {
    defaultSrc: ["'none'"],
    styleSrc: ["'self'"],
    fontSrc: ["'self'"],
    imgSrc: ["'self'", 'https:', 'data:'],
    baseUri: ["'none'"],
    formAction: ["'none'"],
  },
});

const adminPolicy = helmet.contentSecurityPolicy({
  useDefaults: false,
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
    fontSrc: ["'self'"],
    imgSrc: ["'self'", 'https:', 'data:'],
    connectSrc: ["'self'"],
    frameSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'none'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
  },
});

function isAdminPath(path) {
  return path === '/admin' || path.slice(0, 7) === '/admin/';
}

function createApp(options) {
  const opts = options || {};
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  if (opts.logRequests !== false) {
    app.use(morgan(config.isProduction ? 'combined' : 'dev', {
      skip: (req) => req.path === '/healthz' || req.path.slice(0, 8) === '/assets/' || req.path.slice(0, 14) === '/admin/assets/',
    }));
  }

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    // Policies may be shown inside other sites and apps; the admin forbids framing through its CSP.
    frameguard: false,
    hsts: { maxAge: 15552000, includeSubDomains: false },
  }));
  app.use((req, res, next) => (isAdminPath(req.path) ? adminPolicy : publicPolicy)(req, res, next));
  app.use(compression());
  app.use(cookieParser());

  app.use('/assets', assets.middleware());
  app.use('/api', express.json({ limit: '2mb' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', apiRoutes);
  app.use('/api', apiNotFound);
  app.use('/admin', adminUi);
  app.use(publicRoutes);
  app.use(pageNotFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
