'use strict';

// Builds the React admin into client/dist.
//   node scripts/build-client.js           production build (minified, fingerprinted file names)
//   node scripts/build-client.js --watch   development: rebuilds whenever a file changes

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'client', 'dist');
const watch = process.argv.indexOf('--watch') !== -1;

function writeIndex(metafile) {
  const outputs = Object.keys(metafile.outputs);
  const js = outputs.find((file) => /\.js$/.test(file));
  const css = outputs.find((file) => /\.css$/.test(file));
  const href = (file) => '/admin/assets/' + path.basename(file);
  const page = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex, nofollow">',
    '<meta name="color-scheme" content="light dark">',
    '<title>Privacy Policies admin</title>',
    '<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">',
    css ? '<link rel="stylesheet" href="' + href(css) + '">' : '',
    '<script defer src="' + href(js) + '"></script>',
    '</head>',
    '<body>',
    '<div id="root"></div>',
    '<noscript>The admin needs JavaScript.</noscript>',
    '</body>',
    '</html>',
    '',
  ].filter((part) => part !== '').join('\n');
  fs.writeFileSync(path.join(OUT, 'index.html'), page + '\n');
}

const writeIndexPlugin = {
  name: 'write-index',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length || !result.metafile) return;
      writeIndex(result.metafile);
      if (watch) console.log('[admin] Rebuilt at ' + new Date().toLocaleTimeString());
    });
  },
};

const options = {
  entryPoints: [path.join(ROOT, 'client', 'src', 'main.jsx')],
  bundle: true,
  outdir: path.join(OUT, 'assets'),
  entryNames: watch ? 'app' : 'app-[hash]',
  jsx: 'automatic',
  loader: { '.js': 'jsx' },
  target: ['chrome90', 'edge90', 'firefox90', 'safari14'],
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  metafile: true,
  // Fonts and the favicon are served by the server from /assets.
  external: ['/assets/*'],
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
  logLevel: 'warning',
  plugins: [writeIndexPlugin],
};

async function main() {
  if (fs.existsSync(OUT)) {
    // fs.rmSync arrived in Node 14.14; Node 14.5 only has the recursive rmdirSync.
    if (fs.rmSync) fs.rmSync(OUT, { recursive: true });
    else fs.rmdirSync(OUT, { recursive: true });
  }
  fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });

  if (watch) {
    const context = await esbuild.context(options);
    await context.watch();
    console.log('[admin] Watching client/src for changes.');
    return;
  }
  const result = await esbuild.build(options);
  for (const [file, output] of Object.entries(result.metafile.outputs)) {
    console.log('[admin] ' + path.relative(ROOT, file) + '  ' + (output.bytes / 1024).toFixed(1) + ' KB');
  }
  console.log('[admin] Built client/dist/index.html');
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
