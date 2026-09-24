'use strict';

// `npm run dev`: rebuilds the admin when client/ changes and restarts the server when server/ or
// shared/ changes. Open http://localhost:4000 (or the PORT in .env).

const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const env = Object.assign({}, process.env, { NODE_ENV: process.env.NODE_ENV || 'development' });
const children = [];

function stopAll(code) {
  children.forEach((child) => child.kill('SIGTERM'));
  process.exit(code);
}

function run(name, args) {
  const child = spawn(process.execPath, args, { cwd: ROOT, env, stdio: 'inherit' });
  child.on('exit', (code) => {
    console.log('[dev] ' + name + ' stopped' + (code ? ' (exit code ' + code + ')' : '') + '.');
    stopAll(code || 0);
  });
  children.push(child);
}

run('admin build', [path.join('scripts', 'build-client.js'), '--watch']);
run('server', [
  require.resolve('nodemon/bin/nodemon.js'),
  '--quiet',
  '--watch', 'server',
  '--watch', 'shared',
  '--ext', 'js,css',
  path.join('server', 'index.js'),
]);

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
