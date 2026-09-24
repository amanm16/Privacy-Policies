# Privacy Policies

One site for every app's privacy policy. Each app gets one permanent address, for example
`https://privacy.example.com/hiro`, which you paste into its App Store and Google Play listing.
Policies are managed from an admin at `/admin`, stored in MongoDB, and served as fast, plain HTML
pages that need no JavaScript, so store reviewers, crawlers and in-app WebViews all see the
whole policy.

Built with MongoDB, Express, React and Node, and tested on **Node 14.5.0 with npm 6.14.5**, the
versions on our server.

- **Public pages:** `/<app>` shows one policy, and `/` lists all published ones. Pages are
  rendered on the server, work without JavaScript, adapt to phones and dark mode, and print cleanly.
- **Admin:** import an existing HTML policy, edit it with a live preview, publish, and see or
  restore every earlier version.
- **Pre-publish checks:** a policy that still contains placeholders such as
  `[REGISTERED OFFICE ADDRESS]` can't be published. You also get advice on what store reviewers
  look for: a contact address, data deletion, children, third-party services, and the age of the
  effective date.
- **Safe by construction:** policy HTML is rebuilt from an allowlist on every save, so scripts,
  styles and event handlers never reach a page. Public pages load nothing from third parties, not
  even fonts.

## Contents

- [Addresses](#addresses)
- [Run it locally](#run-it-locally)
- [Deploy to the server](#deploy-to-the-server)
- [Adding and updating policies](#adding-and-updating-policies)
- [Moving a policy off GitHub Pages or Vercel](#moving-a-policy-off-github-pages-or-vercel)
- [Configuration](#configuration)
- [Node 14.5: rules for dependencies](#node-145-rules-for-dependencies)
- [Security](#security)
- [Project layout](#project-layout)
- [Tests](#tests)
- [Troubleshooting](#troubleshooting)

## Addresses

| Address | What it is |
| --- | --- |
| `/<slug>` | The policy for one app, for example `/hiro`. Only published policies are public. |
| `/` | List of published policies (turn off with `SHOW_INDEX=false`). |
| `/admin` | The admin. |
| `/api/policies`, `/api/policies/<slug>` | Published policies as JSON, for apps that show the policy natively. |
| `/healthz` | `200 {"status":"ok"}` while the database is reachable, `503` if not. |

Addresses never break:

- **Renaming.** If you rename a policy's address, the old one keeps redirecting (301) to the new
  one, and no other policy can take it.
- **Typos.** Capital letters and a trailing slash redirect to the canonical address (`/HIRO/` → `/hiro`).
- **Deleting.** A published policy can't be deleted: unpublish it first. Store listings may still
  point at it.

Slugs are 1–64 lowercase letters, digits and hyphens. `admin`, `api`, `assets`, `healthz`,
`login`, `logout`, `new`, `robots` and `static` are reserved.

## Run it locally

You need Node 14.5.0 (see `.nvmrc`; later versions work too) and MongoDB. For MongoDB you can use
`docker run -d -p 27017:27017 mongo:7`.

```sh
nvm use                              # Node 14.5.0
npm ci                               # installs exactly what package-lock.json lists
cp .env.example .env                 # then set NODE_ENV=development
npm run user -- add you@example.com  # asks for a password
npm run seed                         # imports the policies in Documents/
npm run dev                          # http://localhost:4000 and http://localhost:4000/admin
```

`npm run dev` rebuilds the admin when `client/` changes and restarts the server when `server/`
or `shared/` changes.

## Deploy to the server

These steps assume Node 14.5.0 and npm 6 on the server, MongoDB reachable from it, and nginx in
front for HTTPS.

1. **Install.** Install dependencies including the dev ones, which are needed to build the admin,
   then build:

   ```sh
   git clone <this repo> privacy-policies && cd privacy-policies
   npm ci --production=false
   npm run build          # writes client/dist
   ```

   Use `npm ci`, not `npm install`: it installs the exact versions in `package-lock.json`, which
   have all been checked on Node 14.5 (see [below](#node-145-rules-for-dependencies)).
   `--production=false` keeps the build tools even when `NODE_ENV=production` is set.

2. **Configure.** Copy `.env.example` to `.env` and fill it in. At minimum set `MONGODB_URI`,
   `SESSION_SECRET` and `PUBLIC_BASE_URL`. Generate the secret with:

   ```sh
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. **Create an admin account and import the existing policies:**

   ```sh
   npm run user -- add you@m16labs.com
   npm run seed
   ```

4. **Run it with pm2:**

   ```sh
   pm2 start ecosystem.config.js
   pm2 save
   ```

   Or run `node server/index.js` under any process manager. It exits on `SIGTERM` after
   finishing in-flight requests.

5. **Put nginx in front.** Adjust the server name and certificates:

   ```nginx
   server {
     listen 443 ssl http2;
     server_name privacy.example.com;
     # ssl_certificate / ssl_certificate_key ...

     client_max_body_size 3m;

     location / {
       proxy_pass http://127.0.0.1:4000;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
     }
   }
   ```

   `X-Forwarded-Proto` matters: it makes the session cookie `Secure`. `TRUST_PROXY=loopback`
   (the default) trusts these headers only from nginx on the same machine.

**Updating** after a `git pull`: `npm ci --production=false && npm run build && pm2 restart privacy-policies`.

## Adding and updating policies

### In the admin

- **Import HTML.** Drop in the page a policy lives in now. The app name, operator, effective
  date, contact email and policy text are read from it, and anything it had to guess is listed so
  you can check it. If the address matches an existing policy, the file's text is loaded into that
  policy instead, and saving replaces the current version.
- **New policy.** Starts empty. The address follows the app name until you edit it.
- **Editing.** The right-hand side shows the page exactly as it will be published (switch
  between phone and desktop widths) and the pre-publish checks. Click a placeholder to jump to it
  in the text. `Ctrl/⌘ + S` saves.
- **Publishing.** Choose *Published* and save. Placeholders block publishing, and the other
  checks are advice. Switching back to *Draft* takes the page offline.
- **History.** Every save is kept. Load an earlier version into the editor, then save to make it
  current.

Policy text is HTML. Headings (`h2`, `h3`), paragraphs, lists, tables, links, bold, italics and
`<div class="callout">` boxes are kept. Everything else is removed on save, and the editor lists
what was removed. Page chrome is added automatically: the title, operator, effective-date stamp,
table of contents and footer.

### From the command line

On the server, with `.env` in place:

```sh
npm run import -- path/to/policy.html --dry-run   # show what would be imported
npm run import -- path/to/folder --publish        # import every .html file and publish them
npm run import -- policy.html --slug my-app --publish --update
```

Without `--update`, existing policies are left alone, so re-running `npm run seed` is safe.
Policies with placeholders stay drafts even with `--publish`.

After changing a file in `Documents/`, apply it with `npm run seed -- --update`. The file is
treated as the source of its policy:

- **Matching.** A file updates the policy at its address: `--slug` if you give one, otherwise
  the address its `<title>` suggests. If the address was renamed in the admin, the old one still
  finds the policy, and the policy keeps its new address.
- **What changes.** Unchanged files are reported as up to date. A changed file becomes a new
  version, and the previous text stays in the policy's history.
- **Deleted lines.** The file's public details replace the stored ones. A line you delete from the
  file, such as the operator's second line, the description or the contact email, disappears from
  the page. Admin-only notes are kept when the file has none.
- **Changed titles.** If a file's new `<title>` suggests a different address than the last time
  this file was imported, nothing is guessed. The import stops and names both addresses: re-run
  with `--slug <old>` to update the existing policy, or `--slug <new>` to create a second one.
  The same applies to two apps whose files share a name, such as `index.html`.
- **Offline policies.** A policy someone switched to Draft in the admin is never put back online
  by a re-import. Publish it in the admin.
- **Admin edits.** Updating from a file replaces the text, including edits made in the admin since
  the last import. Treat whichever you edit, the file or the admin, as the one source for that
  policy.

### From CI, so a policy ships with the app

Set `API_TOKEN` in `.env` (32+ characters). Any app repository can then publish its own policy
file when it changes:

```sh
node -e "process.stdout.write(JSON.stringify({ html: require('fs').readFileSync('privacy-policy.html', 'utf8'), filename: 'hiro-privacy-policy.html', slug: 'hiro', save: true, publish: true, overwrite: true }))" \
  | curl -sS -X POST https://privacy.example.com/api/admin/import \
      -H "Authorization: Bearer $PRIVACY_API_TOKEN" -H "Content-Type: application/json" --data-binary @-
```

Always send `slug`: it's what ties the file to its policy, including one first created by
`npm run seed`.

The response includes:

- `action`: `created`, `updated`, `unchanged` or `skipped`;
- `addressKept`: true when the policy was renamed in the admin and the address you sent now
  redirects to it;
- `takenOffline`: true when the policy stays a draft because someone unpublished it;
- the saved policy and its check results.

A policy with placeholders is saved as a draft. If the policy is already published, the request
fails with `422` instead. The same rules as `npm run seed -- --update` apply.

### Admin accounts

```sh
npm run user -- add someone@m16labs.com        # asks for a password (or pipe one in)
npm run user -- add someone@m16labs.com --generate
npm run user -- password someone@m16labs.com   # new password; signs them out everywhere
npm run user -- remove someone@m16labs.com
npm run user -- list
```

## Moving a policy off GitHub Pages or Vercel

1. Import the old page (admin → *Import HTML*, or `npm run import`). A page saved from the
   browser remembers its old address, and the importer puts it in the policy's *Previous address*
   field.
2. Publish it and copy its new address.
3. Put the new address in App Store Connect (*App Privacy → Privacy Policy URL*) and the Play
   Console (*App content → Privacy policy*).
4. Replace the old page with a redirect so existing links keep working:

   ```html
   <!doctype html>
   <meta charset="utf-8">
   <title>Privacy policy moved</title>
   <link rel="canonical" href="https://privacy.example.com/kbocwwb">
   <meta http-equiv="refresh" content="0; url=https://privacy.example.com/kbocwwb">
   <p>This privacy policy has moved to <a href="https://privacy.example.com/kbocwwb">privacy.example.com/kbocwwb</a>.</p>
   ```

## Configuration

Settings live in `.env` (copy `.env.example`). Variables already set in the environment take
precedence.

| Variable | Default | Meaning |
| --- | --- | --- |
| `NODE_ENV` | | `production` on the server. |
| `PORT` | `4000` | Port the server listens on. |
| `HOST` | all interfaces | Set to `127.0.0.1` to accept connections only from nginx on the same machine. |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/privacy_policies` | MongoDB connection string. |
| `PUBLIC_BASE_URL` | | Public address without a trailing slash. Used for canonical links and the admin's *Copy link*. |
| `SESSION_SECRET` | random in development | Signs admin sessions. **Required in production**, 32+ characters. Changing it signs everyone out. |
| `API_TOKEN` | off | Enables `Authorization: Bearer` access to the admin API for scripts and CI. 32+ characters. |
| `SITE_NAME` | `Privacy Policies` | Heading of the list at `/`. |
| `SHOW_INDEX` | `true` | `false` hides the list; `/` then returns 404. |
| `TRUST_PROXY` | `loopback` | Proxies whose `X-Forwarded-*` headers are trusted: `loopback`, a hop count, a subnet, or `false`. |

## Node 14.5: rules for dependencies

Many current packages no longer run on Node 14.5, even when their `engines` field says they do.
The exact versions in `package.json` and `package-lock.json` were installed with npm 6.14.5.
Every CommonJS file in the production dependencies was compiled with Node 14.5.0's parser, and
the server, admin build, dev mode and tests were all run on 14.5.0.

- **Install with `npm ci`.** Don't run `npm update` or `npm install <pkg>@latest`. Before
  changing a dependency, run `npm test` and `npm run build` on Node 14.5.0.
- **Upgrades that fail on Node 14.5:**
  - Express 5, Mongoose 7+ (MongoDB driver 5+), Helmet 7+, esbuild 0.22+, Vite 3+ and
    `sanitize-html` 2.17.6+ all require a newer Node.
  - `nodemon` 3.1.10+ pulls in a `minimatch` that uses private class methods (`#method()`),
    which Node 14.5 can't parse. That's why `nodemon` is pinned at 3.1.9.
- **Our own code on the server.** Code in `server/`, `shared/` and `scripts/` runs untranspiled,
  so it must avoid:
  - syntax and APIs newer than Node 14.5: `??=`, `||=`, `&&=`, private methods, top-level
    `await`, `String#replaceAll`, `Array#at`, `Object.hasOwn`, `structuredClone`, `fetch`,
    `AbortController` and `crypto.randomUUID`;
  - the `node:` prefix in `require()`.
- **Browser code.** Code in `client/` is bundled by esbuild, so modern syntax is fine there.
- **MongoDB.** The driver used here (4.17, through Mongoose 6) supports MongoDB 3.6 to 7.0.
  Tested against 7.0. AWS IAM database logins (`MONGODB-AWS`) aren't available on Node 14.5.

`npm audit --production` (npm 6) or `npm audit --omit=dev` (npm 7+) reports no known
vulnerabilities in the production dependencies. The full audit lists advisories in three
development tools, none of which affect this project:

| Package | Advisory | Why it doesn't apply |
| --- | --- | --- |
| esbuild 0.21 | The dev server (`esbuild --serve`) can be read by other websites. | The dev server isn't used, only `build` and `watch`. The fix needs Node 18. |
| react-router 6.30 | Open redirect when a crafted path is passed to `navigate()` or `<Link>`; injection through SSR hydration data. | The only URL-derived navigation (after sign-in) is limited to known admin paths. No SSR hydration is used. The fix is v7, which declares Node 20. |
| mocha 10 (`serialize-javascript`) | Crafted objects can run code when serialised. | It only serialises our own test data, and every current mocha release depends on it. |

## Security

- **Policy HTML is rebuilt, not filtered** (`server/lib/content.js`):
  - Only allowlisted tags and attributes survive, and links are limited to `http`, `https`,
    `mailto`, `tel` and relative addresses.
  - The output is written out from scratch, so nothing from the input is copied verbatim.
  - This happens on save and again on every render.
- **Content Security Policy.** Public pages send `default-src 'none'` and load only their own
  stylesheet, fonts and images. The admin allows only its own scripts and styles and can't be
  framed.
- **Admin accounts.**
  - Passwords are hashed with scrypt, and wrong emails take as long as wrong passwords.
  - Sign-in is limited to 10 failures per IP address and per email every 15 minutes.
  - Sessions are HTTP-only, `SameSite=Strict` cookies that last 12 hours.
  - Changing a password ends all of that user's sessions.
- **Cross-site request forgery.** Changes made with the session cookie must carry the
  `X-Requested-With` header the admin adds, which other sites can't send.
- **API token.** Compared in constant time. Leave `API_TOKEN` empty to turn token access off.
- **Privacy of the policy pages themselves.** No analytics, no third-party requests, and
  `Referrer-Policy: no-referrer`.

## Project layout

```
server/
  index.js            starts the server (config check, MongoDB, graceful shutdown)
  app.js              Express app: security headers, routes, errors
  config.js           reads .env
  models/             Policy, Revision, User (Mongoose)
  services/policies.js  every read and write of policies: validation, slugs, publishing rule, revisions
  lib/content.js      HTML allowlist, tidy-up and rendering
  lib/importer.js     turns a full HTML page into policy fields
  lib/checks.js       placeholders and store-review advice
  routes/             public pages, public JSON, auth, admin API, admin UI
  views/              server-rendered pages (tagged-template HTML, escaped by default)
  public/             stylesheet, fonts (SIL OFL), favicon
client/src/           React admin (bundled by esbuild into client/dist)
shared/               slug and date helpers used by both sides
scripts/              build, dev, import and user commands
test/                 mocha tests (they import the files in Documents/ as they are now)
Documents/            the latest policy files, imported by `npm run seed`
```

## Tests

```sh
npm test
```

The tests import every file in `Documents/` as it is at that moment. For each file they check that:

- the address, app name, operator and effective date are found without guessing;
- every heading, list item, table cell and bold or italic phrase comes through as the same kind
  of element;
- every paragraph and link comes through, except the exact lines the importer moved into the page
  header and footer (it reports which);
- only markup without policy text (scripts, styles) is dropped.

The importer's rules are tested separately on small made-up pages, so editing a real policy only
breaks a test if the import itself goes wrong.

The HTTP tests need MongoDB. Set `MONGODB_URI_TEST` or run MongoDB on `127.0.0.1:27017`. They
use (and drop) their own database, and they're skipped with a message when no MongoDB is reachable.

## Troubleshooting

- **The server exits with "SESSION_SECRET must be at least 32 random characters".** Set it in
  `.env`; it's required when `NODE_ENV=production`.
- **`/admin` says the admin has not been built.** Run `npm run build`, then restart.
- **You can sign in but get signed out straight away, behind nginx.** Check that nginx sends
  `X-Forwarded-Proto` and that `TRUST_PROXY` matches your setup. The session cookie is `Secure`
  on HTTPS.
- **"Too many sign-in attempts".** Wait 15 minutes, or restart the server, which clears the count.
- **A policy won't publish.** The checks panel lists the placeholders left in the text or fields.
  Replace them and save.
