'use strict';

const config = require('./config');
const db = require('./db');
const User = require('./models/User');
const { createApp } = require('./app');

async function main() {
  const problems = config.problems();
  if (problems.length) {
    problems.forEach((problem) => console.error('[config] ' + problem));
    console.error('[config] Fix these in .env (see .env.example), then start again.');
    process.exit(1);
  }
  if (config.sessionSecretGenerated) {
    console.warn('[config] SESSION_SECRET is not set, so a random one is used: admin sessions end when the server restarts.');
  }

  await db.connect(config.mongoUri);
  console.log('[db] Connected to MongoDB.');
  if ((await User.estimatedDocumentCount()) === 0) {
    console.warn('[admin] No admin accounts yet. Create one with: npm run user -- add you@example.com');
  }

  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    console.log('[http] Listening on http://' + (config.host || 'localhost') + ':' + config.port);
  });

  let stopping = false;
  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    console.log('[http] ' + signal + ' received, shutting down.');
    setTimeout(() => process.exit(1), 10000).unref();
    server.close(() => {
      db.disconnect().then(() => process.exit(0), () => process.exit(1));
    });
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}

main().catch((err) => {
  console.error('[startup] ' + (err && err.message ? err.message : err));
  process.exit(1);
});
