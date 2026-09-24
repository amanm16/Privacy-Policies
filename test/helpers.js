'use strict';

const fs = require('fs');
const path = require('path');

const DOCUMENTS = path.join(__dirname, '..', 'Documents');

// Every policy file in Documents/, read as it is right now. Tests never keep copies of these files,
// so they always check the latest versions.
function documents() {
  return fs.readdirSync(DOCUMENTS)
    .filter((name) => /\.html?$/i.test(name))
    .sort()
    .map((name) => ({ name, html: fs.readFileSync(path.join(DOCUMENTS, name), 'utf8') }));
}

// Policy text that passes every pre-publish check.
const COMPLETE_TEXT = [
  '<h2>What we collect</h2><p>' + 'We collect your name and phone number to run the app. '.repeat(20) + '</p>',
  '<h2>Third-party services</h2><p>We use Google Play Services.</p>',
  '<h2>Deletion</h2><p>Ask us to delete your data at any time.</p>',
  '<h2>Children</h2><p>The app is not meant for children under 13.</p>',
  '<h2>Contact</h2><p><a href="mailto:privacy@example.test">privacy@example.test</a></p>',
].join('');

// Made-up pages in the three layouts the supplied policies use.
const PAGES = {
  // Title, date and a two-line operator block inside <main>; copyright footer.
  operatorBlock: [
    '<!DOCTYPE html>',
    '<html lang="en"><head><meta charset="UTF-8">',
    '<meta name="description" content="Privacy Policy for the ACME Field Survey application.">',
    '<title>ACME — Privacy Policy</title><style>body { margin: 0 }</style></head>',
    '<body><main>',
    '  <h1>Privacy Policy</h1>',
    '  <p class="meta">Effective date: 23 September 2026</p>',
    '  <p class="org">Acme Welfare Board (AWB)<br>',
    '  Government of Somewhere, Labour Department</p>',
    '  <p>This Privacy Policy applies to the <strong>ACME Field Survey</strong> mobile application and related services.</p>',
    '  <h2>Information Collection and Use</h2>',
    '  <p>We collect your name.</p>',
    '  <ul><li>Name</li><li>Photo</li></ul>',
    '  <h2>Contact Us</h2>',
    '  <p>Write to <a href="mailto:help@acme.example">help@acme.example</a>.</p>',
    '  <footer>&copy; 2026 Acme Welfare Board (AWB). All rights reserved.</footer>',
    '</main></body></html>',
  ].join('\n'),

  // Title block in a <header>, sections in <main>, saved from GitHub Pages.
  headerLayout: [
    '<!DOCTYPE html>',
    '<!-- saved from url=(0038)https://someone.github.io/bee-policy/ -->',
    '<html lang="en"><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8">',
    '<title>BEE — Privacy Policy</title></head>',
    '<body>',
    '  <header><div class="container">',
    '    <h1>Privacy Policy</h1>',
    '    <p class="subtle">Effective date: 1 July 2025</p>',
    '    <p class="subtle"><strong>Bee Construction Board (BEE)</strong></p>',
    '  </div></header>',
    '  <main class="container">',
    '    <section class="card"><p>This Privacy Policy applies to the BEE mobile application, operated by the <strong>Bee Construction Board (BEE)</strong>.</p></section>',
    '    <section><h2>Permissions Used</h2><ul><li><strong>CAMERA</strong>: For photos.</li></ul></section>',
    '    <section><h2>Contact Us</h2><p>Email <a href="mailto:it@bee.example">it@bee.example</a>.</p></section>',
    '  </main>',
    '  <footer><div class="container"><small>© 2025 Bee Construction Board (BEE). All rights reserved.</small></div></footer>',
    '</body></html>',
  ].join('\n'),

  // The app's name on the first operator line, an author's comment, a callout and a table.
  appOnOperatorLine: [
    '<!DOCTYPE html>',
    '<!--',
    '  ZED — privacy policy.',
    '',
    '  Checked against the app as built.',
    '-->',
    '<html lang="en"><head><title>ZED — Privacy Policy</title></head><body><main>',
    '  <h1>Privacy Policy</h1>',
    '  <p class="meta">Effective date: 24 September 2026</p>',
    '  <p class="org">ZED<br>',
    '  Zed Health Private Limited</p>',
    '  <p>This Privacy Policy applies to <strong>ZED</strong> (the &ldquo;App&rdquo;), a companion app for people with long-term conditions.</p>',
    '  <div class="callout"><p><strong>ZED is not a medical device.</strong> It records what you enter.</p></div>',
    '  <h2>What we collect</h2>',
    '  <table><tr><th>What</th><th>Why</th></tr><tr><td><strong>Phone number</strong></td><td>To sign in</td></tr></table>',
    '  <footer>&copy; 2026 Zed Health Private Limited. All rights reserved.</footer>',
    '</main></body></html>',
  ].join('\n'),

  // A complete page that passes every check.
  complete: [
    '<!DOCTYPE html>',
    '<html lang="en"><head><title>Complete App — Privacy Policy</title></head><body><main>',
    '  <h1>Privacy Policy</h1>',
    '  <p class="meta">Effective date: 1 September 2026</p>',
    '  <p class="org">Complete Apps Private Limited</p>',
    COMPLETE_TEXT,
    '</main></body></html>',
  ].join('\n'),
};

// Placeholders an author left for facts only the company can supply.
PAGES.withPlaceholders = PAGES.operatorBlock
  .replace('We collect your name.', 'Your data is stored in [HOSTING REGION].')
  .replace('mailto:help@acme.example">help@acme.example', 'mailto:[GRIEVANCE OFFICER EMAIL]">[GRIEVANCE OFFICER EMAIL]');

module.exports = { documents, COMPLETE_TEXT, PAGES };
