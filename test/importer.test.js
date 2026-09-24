'use strict';

const assert = require('assert');
const { parseDocument, DomUtils } = require('htmlparser2');
const { importPolicyHtml } = require('../server/lib/importer');
const { cleanContent, describeContent } = require('../server/lib/content');
const { reviewPolicy } = require('../server/lib/checks');
const { slugProblem } = require('../shared/slug');
const { isIsoDate } = require('../shared/dates');
const { documents, PAGES } = require('./helpers');

const squash = (text) => String(text).replace(/\s+/g, ' ').trim();

describe('importPolicyHtml', () => {
  it('reads an operator block with a second line (DBOCWWB layout)', () => {
    const { fields, notes } = importPolicyHtml(PAGES.operatorBlock);
    assert.strictEqual(fields.slug, 'acme');
    assert.strictEqual(fields.appName, 'ACME Field Survey');
    assert.strictEqual(fields.organization, 'Acme Welfare Board (AWB)');
    assert.strictEqual(fields.organizationDetails, 'Government of Somewhere, Labour Department');
    assert.strictEqual(fields.effectiveDate, '2026-09-23');
    assert.strictEqual(fields.contactEmail, 'help@acme.example');
    assert.strictEqual(fields.summary, 'Privacy Policy for the ACME Field Survey application.');
    assert.deepStrictEqual(notes, []);
  });

  it('reads a title block in a <header>, and where the page was saved from (KBOCWWB layout)', () => {
    const { fields, notes } = importPolicyHtml(PAGES.headerLayout);
    assert.strictEqual(fields.slug, 'bee');
    assert.strictEqual(fields.appName, 'BEE');
    assert.strictEqual(fields.organization, 'Bee Construction Board (BEE)');
    assert.strictEqual(fields.effectiveDate, '2025-07-01');
    assert.strictEqual(fields.contactEmail, 'it@bee.example');
    assert.strictEqual(fields.legacyUrl, 'https://someone.github.io/bee-policy/');
    assert.ok(notes.some((note) => note.indexOf('someone.github.io') !== -1));
    assert.ok(/^<p>This Privacy Policy applies to the BEE/.test(fields.content));
  });

  it('skips the app name on the operator line and keeps callouts, tables and author notes (HIRO layout)', () => {
    const { fields } = importPolicyHtml(PAGES.appOnOperatorLine);
    assert.strictEqual(fields.appName, 'ZED');
    assert.strictEqual(fields.organization, 'Zed Health Private Limited');
    assert.strictEqual(fields.organizationDetails, '');
    assert.strictEqual(fields.effectiveDate, '2026-09-24');
    assert.ok(fields.content.indexOf('<div class="callout">') !== -1);
    assert.ok(fields.content.indexOf('<thead>') !== -1);
    assert.strictEqual(fields.internalNotes, 'ZED — privacy policy.\n\nChecked against the app as built.');
  });

  it('removes the page chrome from the policy text', () => {
    for (const name of ['operatorBlock', 'headerLayout', 'appOnOperatorLine']) {
      const { fields } = importPolicyHtml(PAGES[name]);
      assert.ok(!/<h1|All rights reserved|<style|<footer|<header|Effective date:/.test(fields.content), name);
      assert.ok(/^<p>This Privacy Policy applies to/.test(fields.content), name);
    }
  });

  it('treats navigation as page chrome', () => {
    const page = PAGES.appOnOperatorLine.replace('<h2>What we collect</h2>', '<nav><a href="#collect">What we collect</a></nav>\n  <h2>What we collect</h2>');
    const { fields, removed } = importPolicyHtml(page);
    assert.deepStrictEqual(removed, []);
    assert.ok(fields.content.indexOf('#collect') === -1);
  });

  it('finds placeholders, so the policy cannot be published', () => {
    const { fields } = importPolicyHtml(PAGES.withPlaceholders);
    const review = reviewPolicy(fields);
    assert.deepStrictEqual(review.placeholders, ['[HOSTING REGION]', '[GRIEVANCE OFFICER EMAIL]']);
    assert.strictEqual(review.canPublish, false);
    assert.strictEqual(fields.contactEmail, '');
  });

  it('copes with a bare fragment and says what it could not find', () => {
    const { fields, notes } = importPolicyHtml('<p>We collect nothing.</p>', { filename: 'Acme App - Privacy Policy.html' });
    assert.strictEqual(fields.appName, 'Acme App');
    assert.strictEqual(fields.slug, 'acme-app');
    assert.strictEqual(fields.content, '<p>We collect nothing.</p>');
    assert.ok(notes.some((note) => /effective date/.test(note)));
    assert.ok(notes.some((note) => /operates the app/.test(note)));
  });

  it('reads other date styles and the copyright line', () => {
    const page = '<title>Privacy Policy for Zeta</title><h1>Privacy Policy</h1><p>Last updated: March 5, 2025</p><h2>Data</h2><p>Text</p><footer>© 2025 Zeta Labs Pvt Ltd. All rights reserved.</footer>';
    const { fields, notes } = importPolicyHtml(page);
    assert.strictEqual(fields.appName, 'Zeta');
    assert.strictEqual(fields.effectiveDate, '2025-03-05');
    assert.strictEqual(fields.organization, 'Zeta Labs Pvt Ltd');
    assert.ok(notes.some((note) => /last updated/.test(note)));
    assert.strictEqual(fields.content, '<h2>Data</h2>\n<p>Text</p>');
  });
});


// Everything in a source page that must reach the policy text, by kind. Elements inside the page's
// own <head>, <header>, <footer> and <nav> are chrome and are left out.
function sourceParts(html) {
  const doc = parseDocument(html, { decodeEntities: true });
  const inChrome = (node) => {
    for (let current = node; current; current = current.parent) {
      if (['head', 'header', 'footer', 'nav'].indexOf(current.name) !== -1) return true;
    }
    return false;
  };
  const all = DomUtils.findAll((node) => !inChrome(node), doc.children);
  const texts = (names) => all
    .filter((node) => names.indexOf(node.name) !== -1)
    .map((node) => squash(DomUtils.textContent(node)))
    .filter(Boolean);
  return {
    headings: texts(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']),
    items: texts(['li']),
    cells: texts(['th', 'td']),
    emphasis: texts(['strong', 'b', 'em', 'i']),
    paragraphs: texts(['p']),
    links: all.filter((node) => node.name === 'a' && node.attribs.href).map((node) => node.attribs.href.trim()),
  };
}

// Line breaks become spaces on one side and nothing on the other, so compare without whitespace.
const key = (text) => String(text).replace(/\s+/g, '');

describe('the policies in Documents/ (latest versions)', () => {
  const docs = documents();

  it('contains policies to import', () => {
    assert.ok(docs.length > 0);
  });

  it('gives every policy its own address', () => {
    const slugs = docs.map((doc) => importPolicyHtml(doc.html, { filename: doc.name }).fields.slug);
    assert.strictEqual(new Set(slugs).size, slugs.length, slugs.join(', '));
  });

  docs.forEach((doc) => {
    describe(doc.name, () => {
      const imported = importPolicyHtml(doc.html, { filename: doc.name });
      const fields = imported.fields;
      const output = describeContent(fields.content);
      const outputText = key(output.text);
      const lifted = imported.lifted.map((part) => key(part.text));
      const source = sourceParts(doc.html);

      it('finds the address, app name, operator and effective date without guessing', () => {
        assert.strictEqual(slugProblem(fields.slug), null, fields.slug);
        assert.ok(fields.appName, 'app name');
        assert.ok(fields.organization, 'operator');
        assert.ok(isIsoDate(fields.effectiveDate), fields.effectiveDate);
        const guesses = imported.notes.filter((note) => /couldn.t find|taken from/i.test(note));
        assert.deepStrictEqual(guesses, []);
      });

      it('moves only the title, date line, operator lines, header, footer and navigation into fields', () => {
        const kinds = ['header', 'title', 'date', 'operator', 'footer', 'navigation'];
        for (const part of imported.lifted) {
          assert.ok(kinds.indexOf(part.kind) !== -1, part.kind);
          if (part.kind === 'date') assert.ok(part.text.length <= 120, 'date line: ' + part.text);
          if (part.kind === 'operator') assert.ok(part.text.length <= 250, 'operator line: ' + part.text);
        }
        assert.ok(!/<h1|<style|<script|<footer|<header|<nav/.test(fields.content));
      });

      it('drops only markup that carries no policy text', () => {
        const harmless = ['<script>', '<style>', '<noscript>', '<template>', 'style attributes', 'event handler attributes'];
        assert.deepStrictEqual(imported.removed.filter((item) => harmless.indexOf(item.what) === -1), []);
      });

      it('keeps every heading, list item, table cell and bold or italic phrase as the same kind of element', () => {
        const kept = {};
        Object.keys(output.parts).forEach((kind) => { kept[kind] = output.parts[kind].map(key); });
        for (const kind of ['headings', 'items', 'cells', 'emphasis']) {
          for (const text of source[kind]) {
            const movedIntoFields = lifted.some((part) => part.indexOf(key(text)) !== -1) && kept[kind].indexOf(key(text)) === -1;
            if (movedIntoFields && (kind === 'headings' || kind === 'emphasis')) continue; // the page title, or bold in an operator line
            assert.ok(kept[kind].indexOf(key(text)) !== -1, kind + ' missing: ' + text);
          }
        }
      });

      it('keeps every link', () => {
        for (const link of source.links) assert.ok(output.links.indexOf(link) !== -1, 'missing link: ' + link);
      });

      it('keeps every paragraph it did not move into the page header', () => {
        for (const text of source.paragraphs) {
          if (outputText.indexOf(key(text)) !== -1) continue;
          assert.ok(lifted.indexOf(key(text)) !== -1, 'missing: ' + text);
        }
      });

      it('is already clean, so saving it changes nothing', () => {
        assert.strictEqual(cleanContent(fields.content).html, fields.content);
      });
    });
  });
});
