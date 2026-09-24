'use strict';

// Policy text is stored as a small, safe subset of HTML. Everything that comes in (typed into the
// admin, imported from a file, or sent by a script) goes through cleanContent(), which rebuilds the
// markup from an allowlist: every tag, attribute and URL is checked, and the output is written out
// from scratch rather than copied. Scripts, styles, event handlers and unknown markup can't survive.
//
// Pages are rendered through the same pipeline (renderContent), which also adds heading anchors,
// the table of contents and scroll wrappers around tables.

const { parseDocument } = require('htmlparser2');
const { slugify } = require('../../shared/slug');

// Tag -> attributes it may keep.
const ALLOWED_ATTRIBUTES = {
  h2: [], h3: [], h4: [],
  p: [], br: [], hr: [],
  ul: [], ol: ['start'], li: [],
  dl: [], dt: [], dd: [],
  blockquote: [], pre: [], address: [],
  table: [], caption: [], thead: [], tbody: [], tfoot: [], tr: [],
  th: ['colspan', 'rowspan', 'scope'],
  td: ['colspan', 'rowspan'],
  a: ['href', 'title'],
  img: ['src', 'alt', 'width', 'height'],
  strong: [], em: [], u: [], s: [], small: [], sub: [], sup: [], mark: [],
  code: [], kbd: [], abbr: ['title'], cite: [], q: [],
};

const RENAMED = {
  h1: 'h2', h5: 'h4', h6: 'h4',
  b: 'strong', i: 'em', strike: 's', del: 's', ins: 'u', tt: 'code', var: 'em', dfn: 'em',
};

// Removed together with everything inside them.
const DROPPED = new Set([
  'script', 'style', 'noscript', 'template', 'iframe', 'frame', 'frameset', 'object', 'embed',
  'applet', 'param', 'svg', 'math', 'canvas', 'video', 'audio', 'source', 'track', 'picture', 'map',
  'area', 'form', 'input', 'button', 'select', 'textarea', 'option', 'optgroup', 'datalist',
  'output', 'progress', 'meter', 'dialog', 'title', 'head', 'meta', 'link', 'base', 'nav', 'xmp',
  'plaintext', 'noembed', 'noframes',
]);
// Document plumbing: dropped without being mentioned in the clean-up report.
const DROPPED_SILENTLY = new Set(['head', 'title', 'meta', 'link', 'base']);

// Layout wrappers: the tag goes, the content stays. A wrapper that held only inline content
// becomes a paragraph, so "<div>One</div><div>Two</div>" doesn't run together.
const WRAPPERS = new Set([
  'div', 'section', 'article', 'main', 'header', 'footer', 'aside', 'figure', 'figcaption',
  'center', 'details', 'summary', 'fieldset', 'legend', 'hgroup', 'body', 'html',
]);

// A wrapper with one of these classes is kept as a highlighted box: <div class="callout">.
const CALLOUT_CLASS = /(^|[\s_-])(callout|notice|note|alert|warning|important|highlight|disclaimer)($|[\s_-])/i;

const BLOCKS = new Set([
  'h2', 'h3', 'h4', 'p', 'hr', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'pre', 'address',
  'div', 'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
]);
const VOID = new Set(['br', 'hr', 'img']);

// Containers that may hold block content. In the first three, loose inline content becomes a paragraph.
const FLOW = new Set(['#root', 'div', 'blockquote', 'li', 'dd', 'td', 'th']);
const BLOCK_ONLY = new Set(['#root', 'div', 'blockquote']);

const LINK_SCHEMES = ['http', 'https', 'mailto', 'tel'];
const HTML_WHITESPACE = /[ \t\n\r\f]+/g;
const MAX_DEPTH = 60;

// Ids the page template uses itself; headings never get these.
const PAGE_IDS = ['top', 'policy', 'contents', 'main'];

function element(name, attrs, children) {
  return { type: 'tag', name, attrs, children };
}

function isElementNode(node) {
  return node.type === 'tag' || node.type === 'script' || node.type === 'style';
}

function isBlock(node) {
  return node.type === 'tag' && BLOCKS.has(node.name);
}

function isInline(node) {
  return !isBlock(node);
}

function isBlankText(node) {
  return node.type === 'text' && !/[^ \t\n\r\f]/.test(node.text);
}

function hasContent(nodes) {
  return nodes.some((node) => {
    if (node.type === 'text') return !isBlankText(node);
    if (node.name === 'img' || node.name === 'hr') return true;
    return hasContent(node.children);
  });
}

function append(target, items) {
  for (let i = 0; i < items.length; i += 1) target.push(items[i]);
  return target;
}

function createReport() {
  const counts = new Map();
  return {
    add(label) {
      counts.set(label, (counts.get(label) || 0) + 1);
    },
    list() {
      return Array.from(counts, ([what, count]) => ({ what, count }));
    },
  };
}

// --- Step 1: rebuild the parsed DOM from the allowlist -------------------------------------------

// Browsers ignore control characters and whitespace inside a scheme ("java\tscript:"), so they are
// stripped before looking at it.
function urlScheme(url) {
  const compact = url.replace(/[\u0000- \u007f-\u009f]+/g, '');
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(compact);
  return match ? match[1].toLowerCase() : null;
}

function safeLink(url) {
  const scheme = urlScheme(url);
  return scheme === null || LINK_SCHEMES.indexOf(scheme) !== -1 ? url : null;
}

function safeImage(url) {
  const scheme = urlScheme(url);
  if (scheme === null || scheme === 'http' || scheme === 'https') return url;
  if (scheme === 'data' && /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(url)) {
    return url.replace(/\s+/g, '');
  }
  return null;
}

function cleanAttributeValue(name, value, report) {
  const text = String(value).trim();
  if (!text) return null;
  switch (name) {
    case 'href': {
      const url = safeLink(text);
      if (url === null) report.add('unsafe links');
      return url;
    }
    case 'src': {
      const url = safeImage(text);
      if (url === null) report.add('unsafe images');
      return url;
    }
    case 'colspan':
    case 'rowspan':
      return /^\d{1,3}$/.test(text) && Number(text) >= 1 ? String(Math.min(Number(text), 100)) : null;
    case 'start':
      return /^-?\d{1,6}$/.test(text) ? String(Number(text)) : null;
    case 'width':
    case 'height':
      return /^\d{1,4}$/.test(text) ? String(Number(text)) : null;
    case 'scope':
      return /^(row|col|rowgroup|colgroup)$/i.test(text) ? text.toLowerCase() : null;
    default:
      // title, alt
      return text.replace(/\s+/g, ' ').slice(0, 300);
  }
}

function cleanAttributes(name, attribs, report) {
  const attrs = [];
  for (const key of ALLOWED_ATTRIBUTES[name]) {
    if (!Object.prototype.hasOwnProperty.call(attribs, key)) continue;
    const value = cleanAttributeValue(key, attribs[key], report);
    if (value !== null) attrs.push([key, value]);
  }
  return attrs;
}

function noteDroppedAttributes(attribs, report) {
  for (const key of Object.keys(attribs)) {
    if (key === 'style') report.add('style attributes');
    else if (key.slice(0, 2) === 'on') report.add('event handler attributes');
  }
}

function domText(nodes) {
  let out = '';
  for (const node of nodes || []) {
    if (node.type === 'text') out += node.data;
    else if (node.type === 'tag' && !DROPPED.has(node.name)) out += ' ' + domText(node.children) + ' ';
  }
  return out;
}

function cleanNodes(nodes, context, report) {
  const out = [];
  for (const node of nodes || []) {
    if (node.type === 'text') {
      let text = node.data.replace(/\u0000/g, '');
      if (!context.pre) text = text.replace(HTML_WHITESPACE, ' ');
      if (text) out.push({ type: 'text', text });
      continue;
    }
    if (!isElementNode(node)) continue; // comments, doctypes, CDATA

    const original = node.name.toLowerCase();
    if (DROPPED.has(original)) {
      if (!DROPPED_SILENTLY.has(original)) report.add('<' + original + '>');
      continue;
    }
    if (context.depth >= MAX_DEPTH) {
      out.push({ type: 'text', text: domText(node.children).replace(HTML_WHITESPACE, ' ') });
      continue;
    }

    const attribs = node.attribs || {};
    const name = RENAMED[original] || original;
    const inner = { pre: context.pre || name === 'pre', depth: context.depth + 1 };
    noteDroppedAttributes(attribs, report);

    if ((WRAPPERS.has(name) || name === 'p' || name === 'blockquote') && CALLOUT_CLASS.test(attribs.class || '')) {
      out.push(element('div', [['class', 'callout']], cleanNodes(node.children, inner, report)));
      continue;
    }

    if (ALLOWED_ATTRIBUTES[name]) {
      const attrs = cleanAttributes(name, attribs, report);
      if (name === 'img' && !attrs.some((attr) => attr[0] === 'src')) continue;
      if (name === 'a' && !attrs.some((attr) => attr[0] === 'href')) {
        append(out, cleanNodes(node.children, inner, report));
        continue;
      }
      out.push(element(name, attrs, VOID.has(name) ? [] : cleanNodes(node.children, inner, report)));
      continue;
    }

    const children = cleanNodes(node.children, inner, report);
    if (WRAPPERS.has(name)) out.push({ type: 'group', children });
    else append(out, children);
  }
  return out;
}

// --- Step 2: tidy the structure ------------------------------------------------------------------

// Replaces unwrapped layout wrappers ("groups") with their content, or with a paragraph when the
// wrapper held only inline content inside a container that can take paragraphs.
function resolveGroups(nodes, parent) {
  const out = [];
  const meaningful = nodes.filter((node) => !isBlankText(node)).length;
  for (const node of nodes) {
    if (node.type !== 'group') {
      out.push(node);
      continue;
    }
    const inner = resolveGroups(node.children, parent);
    const onlyChild = meaningful === 1 && !BLOCK_ONLY.has(parent);
    if (FLOW.has(parent) && !onlyChild && inner.every(isInline)) {
      if (hasContent(inner)) out.push(element('p', [], inner));
    } else {
      append(out, inner);
    }
  }
  return out;
}

function trimStart(nodes) {
  while (nodes.length) {
    const first = nodes[0];
    if (first.type === 'text') {
      first.text = first.text.replace(/^[ \t\n\r\f]+/, '');
      if (first.text) return;
    } else if (first.name !== 'br') {
      if (isBlock(first) || VOID.has(first.name)) return;
      trimStart(first.children);
      if (first.children.length) return;
    }
    nodes.shift();
  }
}

function trimEnd(nodes) {
  while (nodes.length) {
    const last = nodes[nodes.length - 1];
    if (last.type === 'text') {
      last.text = last.text.replace(/[ \t\n\r\f]+$/, '');
      if (last.text) return;
    } else if (last.name !== 'br') {
      if (isBlock(last) || VOID.has(last.name)) return;
      trimEnd(last.children);
      if (last.children.length) return;
    }
    nodes.pop();
  }
}

function mergeText(nodes, pre) {
  const out = [];
  for (const node of nodes) {
    const previous = out[out.length - 1];
    if (node.type === 'text' && previous && previous.type === 'text') {
      previous.text = pre ? previous.text + node.text : (previous.text + node.text).replace(HTML_WHITESPACE, ' ');
    } else {
      out.push(node);
    }
  }
  return out;
}

// Wraps runs of inline content in `tag`; blocks that don't belong get a wrapper of their own.
function wrapRuns(nodes, tag, keep) {
  const out = [];
  let run = [];
  const flush = () => {
    trimStart(run);
    trimEnd(run);
    if (hasContent(run)) out.push(element(tag, [], run));
    run = [];
  };
  for (const node of nodes) {
    if (keep(node)) {
      flush();
      out.push(node);
    } else if (isBlock(node)) {
      flush();
      out.push(tag === 'p' ? node : element(tag, [], [node]));
    } else {
      run.push(node);
    }
  }
  flush();
  return out;
}

// List children must be <li>. Stray content becomes an item; a nested list placed straight inside a
// list (a common mistake) joins the item before it instead of getting an empty bullet.
function listItems(nodes) {
  const out = [];
  let run = [];
  const flush = () => {
    trimStart(run);
    trimEnd(run);
    if (hasContent(run)) out.push(element('li', [], run));
    run = [];
  };
  for (const node of nodes) {
    if (node.name === 'li') {
      flush();
      out.push(node);
    } else if ((node.name === 'ul' || node.name === 'ol') && out.length && !hasContent(run)) {
      run = [];
      out[out.length - 1].children.push(node);
    } else if (isBlock(node)) {
      flush();
      out.push(element('li', [], [node]));
    } else {
      run.push(node);
    }
  }
  flush();
  return out;
}

function isEmptyElement(node) {
  if (VOID.has(node.name) || node.name === 'td' || node.name === 'th') return false;
  return !hasContent(node.children);
}

function normalizeRows(nodes) {
  const rows = [];
  for (const node of resolveGroups(nodes, 'tbody')) {
    if (node.type === 'tag' && node.name === 'tr') {
      node.children = normalize(node.children, 'tr');
      if (node.children.length) rows.push(node);
    }
  }
  return rows;
}

// Tables keep only rows, row groups and a caption. A first row made only of <th> cells becomes the
// header. Anything else placed directly inside a table is dropped; browsers would render it outside
// the table anyway.
function normalizeTable(nodes) {
  const out = [];
  let loose = [];
  const flushRows = () => {
    if (!loose.length) return;
    const hasHead = out.some((node) => node.name === 'thead');
    const first = loose[0];
    if (!hasHead && loose.length > 1 && first.children.every((cell) => cell.name === 'th')) {
      out.push(element('thead', [], [loose.shift()]));
    }
    out.push(element('tbody', [], loose));
    loose = [];
  };
  for (const node of resolveGroups(nodes, 'table')) {
    if (node.type !== 'tag') continue;
    if (node.name === 'tr') {
      append(loose, normalizeRows([node]));
      continue;
    }
    flushRows();
    if (node.name === 'caption') {
      node.children = normalize(node.children, 'caption');
      if (hasContent(node.children)) out.push(node);
    } else if (node.name === 'thead' || node.name === 'tbody' || node.name === 'tfoot') {
      node.children = normalizeRows(node.children);
      if (node.children.length) out.push(node);
    }
  }
  flushRows();
  return out;
}

function normalize(nodes, parent) {
  let items = [];
  for (const node of resolveGroups(nodes, parent)) {
    if (node.type === 'tag') {
      node.children = node.name === 'table' ? normalizeTable(node.children) : normalize(node.children, node.name);
      if (isEmptyElement(node)) continue;
    }
    items.push(node);
  }
  items = mergeText(items, parent === 'pre');

  if (BLOCK_ONLY.has(parent)) {
    items = wrapRuns(items, 'p', isBlock);
  } else if (parent === 'ul' || parent === 'ol') {
    items = listItems(items);
  } else if (parent === 'tr') {
    items = wrapRuns(items, 'td', (node) => node.name === 'td' || node.name === 'th');
  } else if (parent === 'dl') {
    items = items.filter((node) => !isBlankText(node));
  }

  if (parent !== 'pre' && (BLOCKS.has(parent) || parent === '#root')) {
    trimStart(items);
    trimEnd(items);
  }
  return items;
}

// --- Step 3: write it out ------------------------------------------------------------------------

function escapeText(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;');
}

function escapeAttribute(text) {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function openTag(node) {
  let out = '<' + node.name;
  for (const [name, value] of node.attrs) out += ' ' + name + '="' + escapeAttribute(value) + '"';
  return out + '>';
}

function inlineHtml(nodes) {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') out += escapeText(node.text);
    else if (VOID.has(node.name)) out += openTag(node);
    else out += openTag(node) + inlineHtml(node.children) + '</' + node.name + '>';
  }
  return out;
}

function blockLines(node, depth) {
  const indent = '  '.repeat(depth);
  if (node.name === 'hr') return [indent + '<hr>'];
  const open = openTag(node);
  const close = '</' + node.name + '>';
  if (node.name === 'pre') return [indent + open + inlineHtml(node.children) + close];
  if (!node.children.some(isBlock)) return [indent + open + inlineHtml(node.children).trim() + close];
  return [indent + open].concat(serializeLines(node.children, depth + 1), [indent + close]);
}

function serializeLines(nodes, depth) {
  const lines = [];
  let run = [];
  const flush = () => {
    const text = inlineHtml(run).trim();
    if (text) lines.push('  '.repeat(depth) + text);
    run = [];
  };
  for (const node of nodes) {
    if (isBlock(node)) {
      flush();
      append(lines, blockLines(node, depth));
    } else {
      run.push(node);
    }
  }
  flush();
  return lines;
}

function serialize(nodes) {
  return serializeLines(nodes, 0).join('\n');
}

// --- Public API ----------------------------------------------------------------------------------

// Cleans already-parsed htmlparser2 nodes (the importer uses this after removing page chrome).
function cleanDomNodes(domNodes) {
  const report = createReport();
  const nodes = normalize(cleanNodes(domNodes, { pre: false, depth: 0 }, report), '#root');
  return { nodes, html: serialize(nodes), removed: report.list() };
}

function parseHtml(input) {
  return parseDocument(String(input || ''), { decodeEntities: true }).children;
}

// -> { html, removed: [{ what, count }] }
function cleanContent(input) {
  const result = cleanDomNodes(parseHtml(input));
  return { html: result.html, removed: result.removed };
}

function plainText(nodes) {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') out += node.text;
    else if (node.name === 'br') out += ' ';
    else out += (isBlock(node) ? ' ' : '') + plainText(node.children) + (isBlock(node) ? ' ' : '');
  }
  return out;
}

function uniqueId(base, used) {
  let id = base;
  for (let n = 2; used.has(id); n += 1) id = base + '-' + n;
  used.add(id);
  return id;
}

// On phones a table with a header row is shown as one card per row, each cell labelled with its
// column heading. Explicit ARIA roles keep it a table for screen readers once CSS restyles it.
// Returns false (leaving the table to scroll sideways) when cells span rows or columns.
function labelTableCells(table) {
  const thead = table.children.find((node) => node.name === 'thead');
  const bodies = table.children.filter((node) => node.name === 'tbody');
  const head = thead && thead.children.find((node) => node.name === 'tr');
  if (!head || !bodies.length) return false;
  const spans = (cell) => cell.attrs.some((attr) => attr[0] === 'colspan' || attr[0] === 'rowspan');
  const rows = bodies.reduce((all, body) => all.concat(body.children), []);
  if (head.children.some(spans) || rows.some((row) => row.children.length !== head.children.length || row.children.some(spans))) {
    return false;
  }
  const labels = head.children.map((cell) => plainText(cell.children).replace(/\s+/g, ' ').trim());
  table.attrs.push(['role', 'table']);
  [thead].concat(bodies).forEach((group) => group.attrs.push(['role', 'rowgroup']));
  head.attrs.push(['role', 'row']);
  head.children.forEach((cell) => cell.attrs.push(['role', 'columnheader']));
  rows.forEach((row) => {
    row.attrs.push(['role', 'row']);
    row.children.forEach((cell, index) => {
      cell.attrs.push(['role', cell.name === 'th' ? 'rowheader' : 'cell']);
      if (labels[index]) cell.attrs.push(['data-label', labels[index]]);
    });
  });
  return true;
}

// -> { html, toc: [{ id, text }] } for the public page.
function renderContent(stored) {
  const { nodes } = cleanDomNodes(parseHtml(stored));
  const toc = [];
  const used = new Set(PAGE_IDS);
  const decorate = (list) => {
    for (let i = 0; i < list.length; i += 1) {
      const node = list[i];
      if (node.type !== 'tag') continue;
      if (node.name === 'h2' || node.name === 'h3') {
        const text = plainText(node.children).replace(/\s+/g, ' ').trim();
        const id = uniqueId(slugify(text).slice(0, 60).replace(/-+$/, '') || 'section', used);
        node.attrs.push(['id', id]);
        if (node.name === 'h2') toc.push({ id, text });
      } else if (node.name === 'table') {
        const stacks = labelTableCells(node);
        list[i] = element('div', [['class', stacks ? 'table-scroll table-scroll--stack' : 'table-scroll']], [node]);
      } else {
        decorate(node.children);
      }
    }
  };
  decorate(nodes);
  return { html: serialize(nodes), toc };
}

// -> { text, links, headings, parts } for the pre-publish checks and the importer tests.
// `headings` are the section (h2) titles; `parts` lists the text of every element by kind.
function describeContent(stored) {
  const { nodes } = cleanDomNodes(parseHtml(stored));
  const links = [];
  const headings = [];
  const parts = { headings: [], items: [], cells: [], emphasis: [] };
  const kinds = { h2: 'headings', h3: 'headings', h4: 'headings', li: 'items', th: 'cells', td: 'cells', strong: 'emphasis', em: 'emphasis' };
  const textOfNode = (node) => plainText(node.children).replace(/\s+/g, ' ').trim();
  const walk = (list) => {
    for (const node of list) {
      if (node.type !== 'tag') continue;
      if (node.name === 'a' || node.name === 'img') {
        const attr = node.attrs.find((pair) => pair[0] === 'href' || pair[0] === 'src');
        if (attr) links.push(attr[1]);
      }
      if (node.name === 'h2') headings.push(textOfNode(node));
      if (kinds[node.name]) parts[kinds[node.name]].push(textOfNode(node));
      walk(node.children);
    }
  };
  walk(nodes);
  return { text: plainText(nodes).replace(/\s+/g, ' ').trim(), links, headings, parts };
}

module.exports = { cleanContent, cleanDomNodes, renderContent, describeContent, parseHtml };
