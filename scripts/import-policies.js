'use strict';

// Imports privacy-policy HTML files into the database.
//
//   npm run import -- <file or folder> [more...] [--publish] [--update] [--dry-run] [--slug <address>]
//
//   --publish   Publish each policy. Policies that still contain placeholders stay drafts.
//   --update    Make the policy at the file's address match the file.
//               Without it, existing policies are left alone, so re-running is safe.
//   --dry-run   Show what would be imported without saving anything.
//   --slug      The address to use (single file only). Otherwise it comes from the page title.
//
// `npm run seed` imports everything in Documents/ with --publish.

const fs = require('fs');
const path = require('path');
const config = require('../server/config');
const db = require('../server/db');
const policies = require('../server/services/policies');
const { importPolicyHtml } = require('../server/lib/importer');
const { reviewPolicy } = require('../server/lib/checks');

const USAGE = 'Usage: npm run import -- <file or folder> [...] [--publish] [--update] [--dry-run] [--slug <address>]';
const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
  const options = { paths: [], publish: false, update: false, dryRun: false, slug: '', help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--publish') options.publish = true;
    else if (arg === '--update') options.update = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--slug') options.slug = String(argv[(i += 1)] || '').toLowerCase();
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.slice(0, 2) === '--') throw new Error('Unknown option ' + arg + '\n' + USAGE);
    else options.paths.push(arg);
  }
  return options;
}

function htmlFiles(target) {
  if (!fs.existsSync(target)) throw new Error('Not found: ' + target);
  if (fs.statSync(target).isFile()) return [target];
  return fs.readdirSync(target)
    .filter((name) => /\.html?$/i.test(name))
    .sort()
    .map((name) => path.join(target, name));
}

function line(label, value) {
  console.log('  ' + (label + '            ').slice(0, 13) + ' ' + value);
}

function describeFailure(err) {
  const fields = err.details && err.details.fields ? Object.values(err.details.fields) : [];
  const extra = fields.filter((message) => message !== err.message);
  const suggestions = err.details && err.details.suggestions;
  if (suggestions) extra.push('Re-run with ' + suggestions.map((slug) => '--slug ' + slug).join(' or ') + '.');
  return err.message + (extra.length ? ' ' + extra.join(' ') : '');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.paths.length) {
    console.log(USAGE);
    return;
  }
  const files = options.paths.reduce((all, target) => all.concat(htmlFiles(target)), []);
  if (!files.length) {
    console.log('No .html files found.');
    return;
  }
  if (options.slug && files.length > 1) throw new Error('--slug can only be used with a single file.');

  if (!options.dryRun) await db.connect(config.mongoUri);
  let failures = 0;

  for (const file of files) {
    const name = path.basename(file);
    const imported = importPolicyHtml(fs.readFileSync(file, 'utf8'), { filename: name });
    if (options.slug) imported.fields.slug = options.slug;
    const fields = imported.fields;
    const review = reviewPolicy(fields);

    console.log('\n' + name);
    line('address', '/' + fields.slug);
    line('app', fields.appName || '(not found)');
    line('operator', fields.organization || '(not found)');
    line('effective', fields.effectiveDate);
    imported.notes.forEach((note) => line('note', note));
    if (review.placeholders.length) line('placeholders', review.placeholders.join(', '));
    review.warnings.forEach((warning) => line('advice', warning.message));

    if (options.dryRun) {
      line('result', 'Dry run: nothing saved.');
      continue;
    }
    try {
      const result = await policies.saveImported(fields, {
        publish: options.publish,
        overwrite: options.update,
        explicitSlug: Boolean(options.slug),
        sourceFile: path.relative(ROOT, path.resolve(file)),
        editor: 'import script',
      });
      const status = result.policy.status;
      const address = '/' + result.policy.slug;
      const outcomes = {
        created: 'Created at ' + address + ' (' + status + ')',
        updated: 'Updated ' + address + ' (' + status + ')',
        unchanged: address + ' is already up to date (' + status + ')',
        skipped: 'Skipped: ' + address + ' already exists. Use --update to make it match this file.',
      };
      const notes = [outcomes[result.action]];
      if (result.addressKept) notes.push('/' + fields.slug + ' was renamed in the admin and redirects here');
      if (options.publish && result.action !== 'skipped' && status !== 'published') {
        notes.push(result.takenOffline
          ? 'Left offline: it was unpublished in the admin. Publish it there to put it back'
          : 'Not published: replace the placeholders first');
      }
      line('result', notes.join('. ') + '.');
    } catch (err) {
      failures += 1;
      line('result', 'Failed: ' + describeFailure(err));
    }
  }

  if (!options.dryRun) await db.disconnect();
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message);
  db.disconnect().catch(() => {});
  process.exitCode = 1;
});
