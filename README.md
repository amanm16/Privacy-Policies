# Privacy Policies

Privacy policies and support pages for M16 Labs apps, for their App Store and Google Play listings,
at **https://privacypolicies.metahos.com**.

- `/` is the home page. It lists the apps under the store each one is published on (App Store,
  Google Play), with a button for each of the app's pages.
- `/<app>` is each app's privacy policy: `policies/<app>.html`. For example `/hiro` is
  `policies/hiro.html`.
- `/<app>/support` is each app's support page, if it has one: `support/<app>.html`. For example
  `/hiro/support` is `support/hiro.html`.
- Anything else shows a "Page not found" page.

Which app belongs to which codebase and store is in [APPS.md](APPS.md).

## What's here

```
index.js      the whole app, on 127.0.0.1:25001
policies/     one privacy policy per app; the file name is its address
support/      one support page per app, for the App Store's Support URL
assets/       the stylesheet, fonts and icon the pages use
Documents/    the original files, kept for reference
```

There is no configuration, no database and nothing to install. Everything is hardcoded in
`index.js`. It runs on Node 14.5.0 (or any Node from 10 up).

## Add a page

Put the app's HTML file in `policies/` (privacy policy) or `support/` (support page), named after
the address it should have: lowercase letters, digits and hyphens. For example
`policies/my-app.html` is `/my-app` and `support/my-app.html` is `/my-app/support`. Use the same
name in both folders, so both pages land on the same app's card.

That's all. The home page counts and buttons come from the folders, so a new page appears by
itself, without a code change or a restart. The card shows the privacy policy's `<title>` without
"— Privacy Policy" (or the support page's without "— Support" if there is no policy).

A new app appears under **Other apps** until it's added to its store in `STORES` at the top of
`index.js` (an app on both stores goes in both). That is a code change, so it needs
`pm2 restart privacypolicies`.

Put `https://privacypolicies.metahos.com/<app>` in the store listing's privacy policy field, and
`https://privacypolicies.metahos.com/<app>/support` in the App Store's Support URL field.

## Run it

```sh
node index.js          # or: npm start
```

Then open http://127.0.0.1:25001.

## Deploy

On the server, from this folder:

```sh
git pull
pm2 start index.js --name privacypolicies    # the first time
pm2 save
```

After later pulls you don't need to do anything for new or changed page files. Only a change to
`index.js` itself needs `pm2 restart privacypolicies`.

nginx forwards the site to it:

```nginx
server {
  listen 443 ssl http2;
  server_name privacypolicies.metahos.com;
  # ssl_certificate / ssl_certificate_key ...

  location / {
    proxy_pass http://127.0.0.1:25001;
  }
}
```
