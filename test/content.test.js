'use strict';

const assert = require('assert');
const { cleanContent, renderContent, describeContent } = require('../server/lib/content');

const clean = (html) => cleanContent(html).html;

describe('cleanContent', () => {
  it('keeps the structure policies use', () => {
    const html = clean('<h2>Data</h2><p>We collect <strong>name</strong> and <em>email</em>.</p><ul><li>One</li><li>Two</li></ul>');
    assert.strictEqual(html, [
      '<h2>Data</h2>',
      '<p>We collect <strong>name</strong> and <em>email</em>.</p>',
      '<ul>',
      '  <li>One</li>',
      '  <li>Two</li>',
      '</ul>',
    ].join('\n'));
  });

  it('removes scripts, styles, frames and event handlers, and reports them', () => {
    const result = cleanContent('<style>p{}</style><p style="color:red" onclick="steal()">Hi</p><script>alert(1)</script><iframe src="https://x"></iframe>');
    assert.strictEqual(result.html, '<p>Hi</p>');
    const removed = result.removed.map((item) => item.what);
    ['<style>', '<script>', '<iframe>', 'style attributes', 'event handler attributes'].forEach((what) => {
      assert.ok(removed.indexOf(what) !== -1, 'reports ' + what);
    });
  });

  it('drops unsafe link schemes, including disguised ones', () => {
    const payloads = [
      'javascript:alert(1)',
      ' JavaScript:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      '&#106;avascript:alert(1)',
      'javascript&colon;alert(1)',
      'vbscript:msgbox(1)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    ];
    for (const href of payloads) {
      const html = clean('<p><a href="' + href + '">x</a></p>');
      assert.strictEqual(html, '<p>x</p>', href);
    }
  });

  it('keeps web, mail, phone and in-page links', () => {
    const html = clean('<p><a href="https://a.test" target="_blank">a</a> <a href="mailto:x@y.test">b</a> <a href="tel:+911234">c</a> <a href="#top">d</a></p>');
    assert.strictEqual(html, '<p><a href="https://a.test">a</a> <a href="mailto:x@y.test">b</a> <a href="tel:+911234">c</a> <a href="#top">d</a></p>');
  });

  it('escapes text so markup in text stays text', () => {
    assert.strictEqual(clean('<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; more</p>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; more</p>');
    assert.strictEqual(clean('<p title="x">A&nbsp;B</p>'), '<p>A&nbsp;B</p>');
  });

  it('survives common XSS vectors', () => {
    const vectors = [
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(1)><script>alert(1)</script></svg>',
      '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
      '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
      '<a href="javas&#x09;cript:alert(1)">x</a>',
      '<div style="background:url(javascript:alert(1))">x</div>',
      '<body onload=alert(1)>',
      '<object data="javascript:alert(1)"></object>',
      '<embed src="javascript:alert(1)">',
      '<form action="javascript:alert(1)"><button>x</button></form>',
      '<p><a href="https://ok.test" onmouseover="alert(1)">x</a></p>',
      '<!--<img src=x onerror=alert(1)>-->',
      '<xmp><img src=x onerror=alert(1)></xmp>',
      '<textarea></textarea><img src=x onerror=alert(1)>',
      '<table><tr><td><img src="x" onerror="alert(1)"></td></tr></table>',
      '"><script>alert(1)</script>',
      '<base href="javascript:alert(1)//">',
      '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
    ];
    for (const vector of vectors) {
      const html = clean(vector);
      assert.ok(!/<script|<style|<svg|<math|<iframe|<object|<embed|<form|<base|<meta/i.test(html), vector + ' -> ' + html);
      assert.ok(!/\son[a-z]+\s*=/i.test(html), vector + ' -> ' + html);
      assert.ok(!/javascript:/i.test(html), vector + ' -> ' + html);
    }
  });

  it('only allows raster data: images', () => {
    assert.strictEqual(clean('<img src="data:image/svg+xml;base64,PHN2Zz4=">'), '');
    assert.strictEqual(clean('<p><img src="data:image/png;base64,iVBORw0KGgo=" alt="Logo"></p>'), '<p><img src="data:image/png;base64,iVBORw0KGgo=" alt="Logo"></p>');
  });

  it('turns layout wrappers into paragraphs and keeps callouts', () => {
    const html = clean('<section class="card"><p>Intro</p></section><div>One</div><div>Two</div><div class="callout"><p>Not medical advice.</p></div>');
    assert.strictEqual(html, [
      '<p>Intro</p>',
      '<p>One</p>',
      '<p>Two</p>',
      '<div class="callout">',
      '  <p>Not medical advice.</p>',
      '</div>',
    ].join('\n'));
  });

  it('demotes h1 to h2 and h5/h6 to h4', () => {
    assert.strictEqual(clean('<h1>A</h1><h5>B</h5><h6>C</h6>'), '<h2>A</h2>\n<h4>B</h4>\n<h4>C</h4>');
  });

  it('gives tables a header and body', () => {
    const html = clean('<table><tr><th>What</th><th>Why</th></tr><tr><td>Name</td><td>Sign-in</td></tr></table>');
    assert.ok(html.indexOf('<thead>') !== -1 && html.indexOf('<tbody>') !== -1, html);
    assert.ok(html.indexOf('<th>What</th>') < html.indexOf('<tbody>'));
  });

  it('attaches a stray nested list to the item before it', () => {
    const html = clean('<ul><li>A</li><ul><li>B</li></ul><li>C</li></ul>');
    assert.strictEqual(html, '<ul>\n  <li>\n    A\n    <ul>\n      <li>B</li>\n    </ul>\n  </li>\n  <li>C</li>\n</ul>');
  });

  it('drops empty paragraphs and keeps whitespace in pre', () => {
    assert.strictEqual(clean('<p> </p><p><br></p><pre>  a\n    b</pre>'), '<pre>  a\n    b</pre>');
  });

  it('is stable: cleaning clean content changes nothing', () => {
    const once = clean('<main><h1>T</h1><section><p>a <b>b</b></p><table><tr><td>x</td></tr></table></section><div class="note">n</div></main>');
    assert.strictEqual(clean(once), once);
  });
});

describe('renderContent', () => {
  it('adds unique heading ids and a table of contents', () => {
    const { html, toc } = renderContent('<h2>What we collect</h2><h3>You</h3><h2>What we collect</h2><h2>Policy</h2>');
    assert.deepStrictEqual(toc, [
      { id: 'what-we-collect', text: 'What we collect' },
      { id: 'what-we-collect-2', text: 'What we collect' },
      { id: 'policy-2', text: 'Policy' },
    ]);
    assert.ok(html.indexOf('<h3 id="you">You</h3>') !== -1);
  });

  it('labels table cells so phones can show one card per row', () => {
    const { html } = renderContent('<table><thead><tr><th>What</th><th>Why</th></tr></thead><tbody><tr><td>Name</td><td>Sign-in</td></tr></tbody></table>');
    assert.ok(html.indexOf('<div class="table-scroll table-scroll--stack">') !== -1, html);
    assert.ok(html.indexOf('<td role="cell" data-label="Why">Sign-in</td>') !== -1, html);
  });

  it('leaves tables with merged cells to scroll', () => {
    const { html } = renderContent('<table><thead><tr><th colspan="2">Both</th></tr></thead><tbody><tr><td>a</td><td>b</td></tr></tbody></table>');
    assert.ok(html.indexOf('<div class="table-scroll">') !== -1, html);
    assert.ok(html.indexOf('data-label') === -1);
  });
});

describe('describeContent', () => {
  it('collects text, links and section headings', () => {
    const result = describeContent('<h2>Contact</h2><p>Write to <a href="mailto:a@b.test">a@b.test</a>.</p>');
    assert.strictEqual(result.text, 'Contact Write to a@b.test.');
    assert.deepStrictEqual(result.links, ['mailto:a@b.test']);
    assert.deepStrictEqual(result.headings, ['Contact']);
  });
});
