# Privacy Policies

Privacy policies for M16 Labs apps, for their App Store and Google Play listings, at
**https://privacypolicies.metahos.com**.

- `/` is the home page. It shows how many policies there are and a button for each one.
- `/<app>` is each app's policy: `policies/<app>.html`. For example `/hiro` is `policies/hiro.html`.
- Anything else shows a "Policy not found" page.

## What's here

```
index.js      the whole app, on 127.0.0.1:25001
policies/     one HTML file per app; the file name is its address
assets/       the stylesheet, fonts and icon the pages use
Documents/    the original policy files, kept for reference
```

There is no configuration, no database and nothing to install. Everything is hardcoded in
`index.js`. It runs on Node 14.5.0 (or any Node from 10 up).

## Add a policy

Put the app's HTML file in `policies/`, named after the address it should have: lowercase
letters, digits and hyphens, for example `policies/my-app.html` for `/my-app`.

That's all. The home page count and its buttons come from the folder, so the new button and
route appear by themselves, without a code change or a restart. The button shows the page's
`<title>` without "— Privacy Policy".

Put `https://privacypolicies.metahos.com/<app>` in the app's App Store and Google Play listing.

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

After later pulls you don't need to do anything for new or changed policy files. Only a change
to `index.js` itself needs `pm2 restart privacypolicies`.

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
