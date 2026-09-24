'use strict';

// End-to-end tests through HTTP. They need MongoDB: set MONGODB_URI_TEST, or run one on
// 127.0.0.1:27017. The test database is dropped before and after. Skipped when none is reachable.

const assert = require('assert');
const http = require('http');

const config = require('../server/config');
const { mongoose } = require('../server/db');
const { createApp } = require('../server/app');
const User = require('../server/models/User');
const Policy = require('../server/models/Policy');
const Revision = require('../server/models/Revision');
const { hashPassword } = require('../server/lib/passwords');
const { escapeHtml } = require('../server/lib/html');
const { importPolicyHtml } = require('../server/lib/importer');
const { reviewPolicy } = require('../server/lib/checks');
const { documents, COMPLETE_TEXT, PAGES } = require('./helpers');

const FROM_ADMIN = { 'X-Requested-With': 'fetch' };
const CONTENT = COMPLETE_TEXT;

// The latest files in Documents/, with what the importer makes of them.
const DOCS = documents().map((doc) => {
  const { fields } = importPolicyHtml(doc.html, { filename: doc.name });
  return { name: doc.name, html: doc.html, fields, publishable: reviewPolicy(fields).canPublish };
});

function draft(overrides) {
  return Object.assign({
    slug: 'sample-app',
    appName: 'Sample App',
    organization: 'Sample Org Pvt Ltd',
    effectiveDate: '2026-09-01',
    content: CONTENT,
    status: 'draft',
  }, overrides);
}

describe('HTTP API (needs MongoDB)', function () {
  let server;
  let port;
  let cookie;

  function call(method, url, options) {
    const opts = options || {};
    return new Promise((resolve, reject) => {
      const data = opts.body === undefined ? null : Buffer.from(JSON.stringify(opts.body));
      const headers = Object.assign(
        {},
        data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {},
        opts.cookie ? { Cookie: opts.cookie } : {},
        opts.headers || {},
      );
      const req = http.request({ host: '127.0.0.1', port, method, path: url, headers }, (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          text += chunk;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(text);
          } catch (err) {
            json = null;
          }
          resolve({ status: res.statusCode, headers: res.headers, text, json });
        });
      });
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }

  const admin = (method, url, body) => call(method, url, { body, cookie, headers: FROM_ADMIN });

  before(async function () {
    try {
      await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 3000 });
    } catch (err) {
      console.log('      Skipped: no MongoDB at ' + config.mongoUri + ' (set MONGODB_URI_TEST).');
      this.skip();
    }
    await mongoose.connection.db.dropDatabase();
    await Promise.all([Policy.init(), Revision.init(), User.init()]);
    await User.create({ email: 'admin@example.test', passwordHash: await hashPassword('correct horse battery') });

    server = createApp({ logRequests: false }).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    port = server.address().port;

    const login = await call('POST', '/api/auth/login', { body: { email: 'Admin@Example.test', password: 'correct horse battery' }, headers: FROM_ADMIN });
    assert.strictEqual(login.status, 200, login.text);
    cookie = login.headers['set-cookie'][0].split(';')[0];
  });

  after(async () => {
    if (server) server.close();
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db.dropDatabase();
      await mongoose.disconnect();
    }
  });

  describe('signing in', () => {
    it('rejects a wrong password without saying which part was wrong', async () => {
      const res = await call('POST', '/api/auth/login', { body: { email: 'admin@example.test', password: 'nope-nope-nope' }, headers: FROM_ADMIN });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.json.error, 'Email or password is incorrect.');
      const unknown = await call('POST', '/api/auth/login', { body: { email: 'who@example.test', password: 'nope-nope-nope' }, headers: FROM_ADMIN });
      assert.strictEqual(unknown.json.error, res.json.error);
    });

    it('sets a strict, HTTP-only session cookie', async () => {
      const res = await call('POST', '/api/auth/login', { body: { email: 'admin@example.test', password: 'correct horse battery' }, headers: FROM_ADMIN });
      const header = res.headers['set-cookie'][0];
      assert.ok(/HttpOnly/i.test(header) && /SameSite=Strict/i.test(header), header);
      const me = await call('GET', '/api/auth/me', { cookie });
      assert.strictEqual(me.json.user.email, 'admin@example.test');
      assert.strictEqual(me.json.publicBaseUrl, 'https://privacy.example.test');
    });

    it('turns away requests without a session, and cross-site writes', async () => {
      assert.strictEqual((await call('GET', '/api/admin/policies')).status, 401);
      assert.strictEqual((await call('POST', '/api/admin/policies', { body: draft(), cookie })).status, 403);
      assert.strictEqual((await call('POST', '/api/auth/login', { body: { email: 'a', password: 'b' } })).status, 403);
    });

    it('accepts the API token, and only the right one', async () => {
      const ok = await call('GET', '/api/admin/policies', { headers: { Authorization: 'Bearer ' + config.apiToken } });
      assert.strictEqual(ok.status, 200);
      const wrong = await call('GET', '/api/admin/policies', { headers: { Authorization: 'Bearer ' + config.apiToken + 'x' } });
      assert.strictEqual(wrong.status, 401);
    });
  });

  describe('policies', () => {
    let id;

    it('creates a draft that is not public yet', async () => {
      const res = await admin('POST', '/api/admin/policies', draft());
      assert.strictEqual(res.status, 201, res.text);
      id = res.json.policy.id;
      assert.strictEqual(res.json.policy.revision, 1);
      assert.strictEqual((await call('GET', '/sample-app')).status, 404);
      assert.strictEqual((await call('GET', '/api/policies/sample-app')).status, 404);
    });

    it('cleans the policy text when saving', async () => {
      const res = await admin('POST', '/api/admin/policies', draft({ slug: 'dirty', content: '<p onclick="x()">Hi</p><script>alert(1)</script>' }));
      assert.strictEqual(res.status, 201, res.text);
      assert.strictEqual(res.json.policy.content, '<p>Hi</p>');
      assert.ok(res.json.removed.some((item) => item.what === '<script>'));
    });

    it('rejects addresses that are taken, reserved or malformed', async () => {
      const taken = await admin('POST', '/api/admin/policies', draft());
      assert.strictEqual(taken.status, 409);
      assert.ok(taken.json.fields.slug);
      const reserved = await admin('POST', '/api/admin/policies', draft({ slug: 'admin' }));
      assert.strictEqual(reserved.status, 400);
      assert.ok(reserved.json.fields.slug);
      const missing = await admin('POST', '/api/admin/policies', { appName: 'X' });
      assert.strictEqual(missing.status, 400);
      assert.deepStrictEqual(Object.keys(missing.json.fields).sort(), ['content', 'effectiveDate', 'organization', 'slug']);
    });

    it('refuses to publish while placeholders remain', async () => {
      const res = await admin('PUT', '/api/admin/policies/' + id, { status: 'published', content: CONTENT + '<p>Office: [REGISTERED OFFICE ADDRESS]</p>' });
      assert.strictEqual(res.status, 422);
      assert.deepStrictEqual(res.json.placeholders, ['[REGISTERED OFFICE ADDRESS]']);
      assert.strictEqual((await call('GET', '/sample-app')).status, 404);
    });

    it('publishes and serves the page at its address', async () => {
      const res = await admin('PUT', '/api/admin/policies/' + id, { status: 'published' });
      assert.strictEqual(res.status, 200, res.text);
      assert.ok(res.json.policy.publishedAt);

      const page = await call('GET', '/sample-app');
      assert.strictEqual(page.status, 200);
      assert.ok(page.text.indexOf('<title>Sample App — Privacy Policy</title>') !== -1);
      assert.ok(page.text.indexOf('<link rel="canonical" href="https://privacy.example.test/sample-app">') !== -1);
      assert.ok(page.text.indexOf('<time class="stamp__date" datetime="2026-09-01">1 Sep 2026</time>') !== -1);
      assert.ok(page.text.indexOf('<h2 id="what-we-collect">What we collect</h2>') !== -1);
      assert.ok(/default-src 'none'/.test(page.headers['content-security-policy']));
      assert.strictEqual(page.headers['cache-control'], 'no-cache');
    });

    it('redirects capitals and trailing slashes to the one address', async () => {
      const upper = await call('GET', '/Sample-App?ref=store');
      assert.strictEqual(upper.status, 301);
      assert.strictEqual(upper.headers.location, '/sample-app?ref=store');
      assert.strictEqual((await call('GET', '/sample-app/')).headers.location, '/sample-app');
    });

    it('keeps the old address working after a rename, and keeps it reserved', async () => {
      const res = await admin('PUT', '/api/admin/policies/' + id, { slug: 'sample-app-2' });
      assert.strictEqual(res.status, 200, res.text);
      assert.deepStrictEqual(res.json.policy.previousSlugs, ['sample-app']);
      const old = await call('GET', '/sample-app');
      assert.strictEqual(old.status, 301);
      assert.strictEqual(old.headers.location, '/sample-app-2');
      const clash = await admin('POST', '/api/admin/policies', draft({ slug: 'sample-app' }));
      assert.strictEqual(clash.status, 409);
    });

    it('keeps every change as a revision', async () => {
      const unchanged = await admin('PUT', '/api/admin/policies/' + id, { appName: 'Sample App' });
      assert.strictEqual(unchanged.json.changed, false);
      const list = await admin('GET', '/api/admin/policies/' + id + '/revisions');
      assert.deepStrictEqual(list.json.revisions.map((r) => r.number), [3, 2, 1]);
      const first = await admin('GET', '/api/admin/policies/' + id + '/revisions/1');
      assert.strictEqual(first.json.revision.data.slug, 'sample-app');
      assert.strictEqual(first.json.revision.data.status, 'draft');
      assert.strictEqual((await admin('GET', '/api/admin/policies/' + id + '/revisions/99')).status, 404);
    });

    it('lists policies with their check results', async () => {
      const res = await admin('GET', '/api/admin/policies');
      const item = res.json.policies.find((policy) => policy.id === id);
      assert.strictEqual(item.status, 'published');
      assert.strictEqual(item.placeholders, 0);
      assert.strictEqual(typeof item.warnings, 'number');
    });

    it('renders an unsaved preview with its checks', async () => {
      const res = await admin('POST', '/api/admin/preview', draft({ content: '<p>Contact [DPO EMAIL]</p>' }));
      assert.strictEqual(res.status, 200);
      assert.ok(res.json.html.indexOf('<meta name="robots" content="noindex">') !== -1);
      assert.deepStrictEqual(res.json.review.placeholders, ['[DPO EMAIL]']);
    });

    it('will not delete a published policy', async () => {
      assert.strictEqual((await admin('DELETE', '/api/admin/policies/' + id)).status, 409);
      await admin('PUT', '/api/admin/policies/' + id, { status: 'draft' });
      assert.strictEqual((await admin('DELETE', '/api/admin/policies/' + id)).status, 204);
      assert.strictEqual((await admin('GET', '/api/admin/policies/' + id)).status, 404);
      assert.strictEqual(await Revision.countDocuments({ policy: id }), 0);
      assert.strictEqual((await admin('GET', '/api/admin/policies/not-an-id')).status, 404);
    });
  });

  describe('importing', () => {
    it('reads a page without saving it', async () => {
      const res = await admin('POST', '/api/admin/import', { html: PAGES.headerLayout, filename: 'bee.html' });
      assert.strictEqual(res.status, 200, res.text);
      assert.strictEqual(res.json.fields.slug, 'bee');
      assert.strictEqual(res.json.existing, null);
      assert.strictEqual(await Policy.countDocuments({ slug: 'bee' }), 0);
    });

    it('saves and publishes, then leaves the policy alone unless told to overwrite', async () => {
      const created = await admin('POST', '/api/admin/import', { html: PAGES.complete, save: true, publish: true });
      assert.strictEqual(created.status, 201, created.text);
      assert.strictEqual(created.json.action, 'created');
      assert.strictEqual(created.json.policy.slug, 'complete-app');
      assert.strictEqual(created.json.policy.status, 'published');
      const again = await admin('POST', '/api/admin/import', { html: PAGES.complete, save: true, publish: true });
      assert.strictEqual(again.json.action, 'skipped');
      const overwrite = await admin('POST', '/api/admin/import', { html: PAGES.complete, save: true, publish: true, overwrite: true });
      assert.strictEqual(overwrite.json.action, 'unchanged');
      const changed = await admin('POST', '/api/admin/import', {
        html: PAGES.complete.replace('Google Play Services', 'Google Play Services and Firebase'),
        save: true,
        overwrite: true,
      });
      assert.strictEqual(changed.json.action, 'updated');
      assert.strictEqual(changed.json.policy.revision, 2);
      const preview = await admin('POST', '/api/admin/import', { html: PAGES.complete });
      assert.strictEqual(preview.json.existing.slug, 'complete-app');
    });

    it('keeps a file with placeholders as a draft even when asked to publish', async () => {
      const res = await admin('POST', '/api/admin/import', { html: PAGES.withPlaceholders, save: true, publish: true });
      assert.strictEqual(res.status, 201, res.text);
      assert.strictEqual(res.json.policy.status, 'draft');
      assert.strictEqual(res.json.review.canPublish, false);
      assert.strictEqual((await call('GET', '/' + res.json.policy.slug)).status, 404);
    });

    it('lets CI import with the API token', async () => {
      const res = await call('POST', '/api/admin/import', {
        body: { html: PAGES.complete, slug: 'ci-app', save: true, publish: true },
        headers: { Authorization: 'Bearer ' + config.apiToken },
      });
      assert.strictEqual(res.status, 201, res.text);
      assert.strictEqual(res.json.policy.slug, 'ci-app');
      assert.strictEqual(res.json.policy.updatedBy, 'api-token');
    });

    const importFile = (html, filename, extra) => admin('POST', '/api/admin/import', Object.assign({ html, filename, save: true, publish: true, overwrite: true }, extra));

    it('follows the file: details removed from it disappear from the page', async () => {
      const first = await importFile(PAGES.operatorBlock, 'follow.html', { slug: 'follow-file' });
      assert.strictEqual(first.status, 201, first.text);
      assert.strictEqual(first.json.policy.organizationDetails, 'Government of Somewhere, Labour Department');
      const trimmed = PAGES.operatorBlock
        .replace('<br>\n  Government of Somewhere, Labour Department', '')
        .replace(/<meta name="description"[^>]*>/, '')
        .replace('help@acme.example">help@acme.example', 'help@acme.example">Contact us');
      const second = await importFile(trimmed, 'follow.html', { slug: 'follow-file' });
      assert.strictEqual(second.json.action, 'updated', second.text);
      assert.strictEqual(second.json.policy.slug, 'follow-file');
      assert.strictEqual(second.json.policy.organizationDetails, '');
      assert.strictEqual(second.json.policy.summary, '');
      const page = await call('GET', '/follow-file');
      assert.ok(page.text.indexOf('Government of Somewhere') === -1, 'removed line is gone from the page');
    });

    it('asks for the address when a file’s title now suggests a different one', async () => {
      const page = PAGES.complete.replace('Complete App — Privacy Policy', 'Renamed App — Privacy Policy');
      const first = await importFile(page, 'renamed.html');
      assert.strictEqual(first.json.policy.slug, 'renamed-app');
      const retitled = page.replace('Renamed App —', 'Renamed App Pro —');
      const refused = await importFile(retitled, 'renamed.html');
      assert.strictEqual(refused.status, 409, refused.text);
      assert.deepStrictEqual(refused.json.suggestions, ['renamed-app', 'renamed-app-pro']);
      assert.strictEqual(await Policy.countDocuments({ slug: 'renamed-app-pro' }), 0);
      const updated = await importFile(retitled, 'renamed.html', { slug: 'renamed-app' });
      assert.strictEqual(updated.json.action, 'updated', updated.text);
      assert.strictEqual(updated.json.policy.appName, 'Renamed App Pro');
    });

    it('updates a policy renamed in the admin through its old address, and keeps the new one', async () => {
      const policy = await Policy.findOne({ slug: 'renamed-app' });
      await admin('PUT', '/api/admin/policies/' + policy._id, { slug: 'renamed-app-2' });
      const page = PAGES.complete.replace('Complete App — Privacy Policy', 'Renamed App — Privacy Policy');
      const res = await importFile(page.replace('children under 13', 'children under 16'), 'renamed.html');
      assert.strictEqual(res.json.action, 'updated', res.text);
      assert.strictEqual(res.json.policy.slug, 'renamed-app-2');
      assert.strictEqual(res.json.addressKept, true);
      assert.ok(res.json.policy.content.indexOf('under 16') !== -1);
    });

    it('keeps two apps apart even when both files are called index.html', async () => {
      const alpha = await importFile(PAGES.complete.replace('Complete App —', 'Alpha App —'), 'index.html');
      assert.strictEqual(alpha.json.policy.slug, 'alpha-app');
      const beta = PAGES.complete.replace('Complete App —', 'Beta App —');
      const refused = await importFile(beta, 'index.html');
      assert.strictEqual(refused.status, 409, refused.text);
      const created = await importFile(beta, 'index.html', { slug: 'beta-app' });
      assert.strictEqual(created.status, 201, created.text);
      const kept = await Policy.findOne({ slug: 'alpha-app' }).lean();
      assert.strictEqual(kept.appName, 'Alpha App');
    });

    it('lets CI keep updating a policy first created by the seed under another file name', async () => {
      const seeded = await importFile(PAGES.complete.replace('Complete App —', 'Seeded App —'), 'Documents/Seeded App.html');
      assert.strictEqual(seeded.status, 201, seeded.text);
      const fromCi = await importFile(PAGES.complete.replace('Complete App —', 'Seeded App —').replace('Google Play Services', 'Firebase'), 'seeded-app-privacy.html', { slug: 'seeded-app' });
      assert.strictEqual(fromCi.json.action, 'updated', fromCi.text);
      assert.ok(fromCi.json.policy.content.indexOf('Firebase') !== -1);
    });

    it('does not put a policy back online after it was unpublished', async () => {
      const page = PAGES.complete.replace('Complete App — Privacy Policy', 'Offline App — Privacy Policy');
      const first = await importFile(page, 'offline.html');
      assert.strictEqual(first.json.policy.status, 'published');
      await admin('PUT', '/api/admin/policies/' + first.json.policy.id, { status: 'draft' });
      const again = await importFile(page, 'offline.html');
      assert.strictEqual(again.json.action, 'unchanged', again.text);
      assert.strictEqual(again.json.policy.status, 'draft');
      assert.strictEqual(again.json.takenOffline, true);
      assert.strictEqual((await call('GET', '/offline-app')).status, 404);
    });

    it('imports and serves every policy in Documents/ as it is now', async () => {
      assert.ok(DOCS.length > 0);
      for (const doc of DOCS) {
        const res = await admin('POST', '/api/admin/import', { html: doc.html, filename: doc.name, save: true, publish: true });
        assert.strictEqual(res.status, 201, doc.name + ': ' + res.text);
        assert.strictEqual(res.json.policy.status, doc.publishable ? 'published' : 'draft', doc.name);
        const page = await call('GET', '/' + doc.fields.slug);
        if (!doc.publishable) {
          assert.strictEqual(page.status, 404, doc.name);
          continue;
        }
        assert.strictEqual(page.status, 200, doc.name);
        assert.ok(page.text.indexOf('<title>' + escapeHtml(doc.fields.appName) + ' — Privacy Policy</title>') !== -1, doc.name);
        assert.ok(page.text.indexOf(escapeHtml(doc.fields.organization)) !== -1, doc.name);
      }
    });
  });

  describe('public site', () => {
    const published = DOCS.filter((doc) => doc.publishable);

    it('lists only published policies on the home page', async () => {
      const res = await call('GET', '/');
      assert.strictEqual(res.status, 200);
      for (const doc of published) assert.ok(res.text.indexOf('href="/' + doc.fields.slug + '"') !== -1, doc.name);
      assert.ok(res.text.indexOf('href="/acme"') === -1, 'drafts are not listed');
      assert.ok(res.text.indexOf('href="/offline-app"') === -1, 'unpublished policies are not listed');
    });

    it('serves published policies as JSON, without admin-only fields', async () => {
      const list = await call('GET', '/api/policies');
      assert.strictEqual(list.headers['access-control-allow-origin'], '*');
      const expected = ['alpha-app', 'beta-app', 'ci-app', 'complete-app', 'follow-file', 'renamed-app-2', 'seeded-app']
        .concat(published.map((doc) => doc.fields.slug))
        .sort();
      assert.deepStrictEqual(list.json.policies.map((p) => p.slug).sort(), expected);
      const one = await call('GET', '/api/policies/ci-app');
      assert.strictEqual(one.json.policy.url, 'https://privacy.example.test/ci-app');
      assert.ok(one.json.policy.html.indexOf('<h2 id=') !== -1);
      assert.ok(!('internalNotes' in one.json.policy) && !('legacyUrl' in one.json.policy));
    });

    it('answers health checks and robots', async () => {
      const health = await call('GET', '/healthz');
      assert.deepStrictEqual(health.json, { status: 'ok', database: 'connected' });
      assert.ok((await call('GET', '/robots.txt')).text.indexOf('Disallow: /admin') !== -1);
    });

    it('shows a 404 page for unknown addresses and JSON 404s for unknown API routes', async () => {
      const page = await call('GET', '/no-such-app');
      assert.strictEqual(page.status, 404);
      assert.ok(page.text.indexOf('Policy not found') !== -1);
      const api = await call('GET', '/api/nothing');
      assert.strictEqual(api.status, 404);
      assert.ok(api.json.error);
    });
  });

  // Last: it locks this IP out of signing in for 15 minutes.
  describe('sign-in rate limit', () => {
    it('blocks after repeated failures', async () => {
      let res;
      for (let i = 0; i < 12; i += 1) {
        res = await call('POST', '/api/auth/login', { body: { email: 'admin@example.test', password: 'wrong-' + i }, headers: FROM_ADMIN });
        if (res.status === 429) break;
      }
      assert.strictEqual(res.status, 429);
      assert.ok(res.headers['retry-after']);
    });
  });
});
