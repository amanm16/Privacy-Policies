'use strict';

// Turns a complete privacy-policy HTML page (the kind generators and developers produce) into the
// fields a policy is stored with. The page's own chrome (title block, effective-date line, operator
// line, footer, navigation) is lifted into fields; the rest becomes the policy text.
//
// Guesses are reported in `notes` so a person can check them before saving.

const { parseDocument, DomUtils } = require('htmlparser2');
const { cleanDomNodes } = require('./content');
const { slugify } = require('../../shared/slug');
const { parseLooseDate, todayIso, formatLongDate } = require('../../shared/dates');

const { findAll, findOne, removeElement, textContent, getAttributeValue, isTag } = DomUtils;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_LINE = /^(effective(?:\s+date)?|last\s+(?:updated|revised|modified)(?:\s+on)?|updated(?:\s+on)?|revised(?:\s+on)?|date)\s*(?:[:\-–—]\s*|\s)(.+)$/i;
const DATE_IN_TEXT = /effective(?:\s+(?:as\s+of|from|on))?\s*[:\-–—]?\s*([^.;]{6,40})/i;
// Classes that name the operator wherever they appear in the title block...
const OPERATOR_CLASS = /(^|[\s_-])(org|organi[sz]ation|company|entity|publisher|owner|operator|developer)($|[\s_-])/i;
// ...and generic ones that only count inside a <header>.
const HEADER_OPERATOR_CLASS = /(^|[\s_-])(subtle|byline|muted|lead)($|[\s_-])/i;
const SAVED_FROM = /^saved from url=\(\d+\)(\S+)/i;
const LINE_BREAKING = new Set(['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'header']);

function squash(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function textOf(node) {
  return squash(textContent(node));
}

function byName(names) {
  return (node) => isTag(node) && names.indexOf(node.name) !== -1;
}

function contains(ancestor, node) {
  for (let current = node; current; current = current.parent) {
    if (current === ancestor) return true;
  }
  return false;
}

// Text of an element split into lines at <br> and block boundaries.
function linesOf(node) {
  const lines = [''];
  const walk = (children) => {
    for (const child of children || []) {
      if (child.type === 'text') {
        lines[lines.length - 1] += child.data;
      } else if (isTag(child) && child.name === 'br') {
        lines.push('');
      } else if (isTag(child)) {
        const breaks = LINE_BREAKING.has(child.name);
        if (breaks) lines.push('');
        walk(child.children);
        if (breaks) lines.push('');
      }
    }
  };
  walk(node.children);
  return lines.map(squash).filter(Boolean);
}

// "DBOCWWB — Privacy Policy", "Privacy Policy for HIRO", "HIRO Privacy Policy" -> the app's name.
function nameFromTitle(title) {
  const name = squash(title)
    .replace(/\.html?$/i, '')
    .replace(/\s*[—–|:·•-]\s*privacy\s+(policy|notice).*$/i, '')
    .replace(/^privacy\s+(policy|notice)\s*(?:[—–|:·•-]\s*|(?:for|of)\s+(?:the\s+)?)/i, '')
    .replace(/\s+privacy\s+(policy|notice)$/i, '')
    .trim();
  return /^privacy\s+(policy|notice)$/i.test(name) ? '' : name;
}

// "This Privacy Policy applies to the DBOCWWB Labour Welfare mobile application" gives a fuller
// name than the page title. Only trusted when it contains the title's name.
function nameFromIntro(paragraphs, shortName) {
  for (const paragraph of paragraphs.slice(0, 4)) {
    const match = /applies to (?:the )?(.{2,60}?) (?:mobile |android |ios |web )?(?:app|application)\b/i.exec(textOf(paragraph));
    if (!match) continue;
    const candidate = match[1].replace(/^["“]|["”]$/g, '').trim();
    // A name, not a clause: no brackets, commas or quotes, and only a few words.
    if (!/^[\p{L}\p{N}][\p{L}\p{N} &'’.-]{0,48}$/u.test(candidate) || candidate.split(' ').length > 6) continue;
    if (!shortName || candidate.toLowerCase().indexOf(shortName.toLowerCase()) !== -1) return candidate;
  }
  return '';
}

// The title block is everything before the first section heading: where generators put the
// effective date and the operator. Lines found there are page chrome and are removed from the text.
function titleBlockTest(doc, header) {
  const all = findAll(() => true, doc.children);
  const firstSection = all.findIndex((node) => node.name === 'h2' && !(header && contains(header, node)));
  const limit = firstSection === -1 ? Math.min(all.length, 40) : firstSection;
  const inBlock = new Set(all.slice(0, limit));
  return (node) => inBlock.has(node) || Boolean(header && contains(header, node));
}

function findDateLine(doc, inTitleBlock) {
  const candidates = findAll(byName(['p', 'div', 'span', 'time', 'small', 'li', 'em', 'strong', 'h2', 'h3', 'h4', 'h5', 'h6']), doc.children);
  let found = null;
  for (const node of candidates) {
    if (found && contains(found.node, node)) continue;
    const text = textOf(node);
    if (!text || text.length > 120) continue;
    const match = DATE_LINE.exec(text);
    const iso = match && parseLooseDate(match[2]);
    if (!iso) continue;
    const effective = /^effective/i.test(match[1]);
    const chrome = inTitleBlock(node);
    if (!found || (effective && !found.effective) || (chrome && !found.chrome && effective === found.effective)) {
      found = { node, iso, effective, chrome };
    }
    if (effective && chrome) break;
  }
  return found;
}

function findOperator(doc, header, inTitleBlock, skip) {
  const candidates = findAll((node) => isTag(node) && ['p', 'div', 'span', 'address'].indexOf(node.name) !== -1
    && inTitleBlock(node) && !skip(node), doc.children);
  for (const node of candidates) {
    const className = getAttributeValue(node, 'class') || '';
    const inHeader = Boolean(header && contains(header, node));
    if (!OPERATOR_CLASS.test(className) && !(inHeader && HEADER_OPERATOR_CLASS.test(className))) continue;
    const text = textOf(node);
    if (text && text.length < 250 && !DATE_LINE.test(text)) return { node, lines: linesOf(node) };
  }
  if (header) {
    const node = findOne((el) => isTag(el) && el.name === 'p' && !skip(el) && textOf(el).length < 250, header.children);
    if (node) return { node, lines: linesOf(node) };
  }
  return null;
}

function emailFromMailto(href) {
  try {
    const email = decodeURIComponent(href.replace(/^mailto:/i, '').split('?')[0]).trim();
    return EMAIL.test(email) ? email.toLowerCase() : '';
  } catch (err) {
    return '';
  }
}

function operatorFromFooter(footer) {
  const match = /©\s*(?:\d{4}\s*)?(.+?)\.?\s*All rights reserved/i.exec(textOf(footer));
  return match ? squash(match[1].replace(/^\d{4}[\s,-]*/, '')) : '';
}

function commentsIn(doc) {
  const comments = [];
  const walk = (children) => {
    for (const child of children || []) {
      if (child.type === 'comment') comments.push(String(child.data).trim());
      else if (child.children) walk(child.children);
    }
  };
  walk(doc.children);
  return comments.filter(Boolean);
}

// Removes the common indentation from a multi-line comment so it reads well as a note.
function dedent(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const indents = lines.slice(1).filter((line) => line.trim()).map((line) => /^[ \t]*/.exec(line)[0].length);
  const cut = indents.length ? Math.min.apply(null, indents) : 0;
  return lines.map((line, i) => (i === 0 ? line : line.slice(cut))).join('\n').trim();
}

// -> { fields, notes, removed, lifted: [{ kind, text }] }
function importPolicyHtml(input, options) {
  const filename = (options && options.filename) || '';
  const doc = parseDocument(String(input || ''), { decodeEntities: true });
  const notes = [];

  const title = textOf(findOne(byName(['title']), doc.children) || { children: [] });
  const description = squash(getAttributeValue(
    findOne((node) => isTag(node) && node.name === 'meta' && /^description$/i.test(getAttributeValue(node, 'name') || ''), doc.children) || { attribs: {} },
    'content',
  ));

  // Author comments: "saved from url=(...)" records where the page used to live; anything else is
  // kept as an internal note (often instructions like "replace the placeholders before publishing").
  let legacyUrl = '';
  const internal = [];
  for (const comment of commentsIn(doc)) {
    const saved = SAVED_FROM.exec(comment);
    if (saved) legacyUrl = saved[1];
    else if (!/^\[if |^<!\[endif|^\s*$/i.test(comment)) internal.push(dedent(comment));
  }

  const h1 = findOne(byName(['h1']), doc.children);
  const header = findOne((node) => isTag(node) && node.name === 'header' && (!h1 || contains(node, h1)), doc.children);
  const footers = findAll(byName(['footer']), doc.children);
  const inTitleBlock = titleBlockTest(doc, header);
  const dateLine = findDateLine(doc, inTitleBlock);
  const dateNode = dateLine && dateLine.chrome ? dateLine.node : null;
  const operator = findOperator(doc, header, inTitleBlock, (node) => (h1 && contains(h1, node)) || (dateNode && contains(dateNode, node)));

  const shortName = nameFromTitle(title) || nameFromTitle(h1 ? textOf(h1) : '') || nameFromTitle(filename);

  let organization = '';
  let organizationDetails = '';
  if (operator) {
    const lines = operator.lines.slice();
    if (lines.length > 1 && shortName && lines[0].toLowerCase() === shortName.toLowerCase()) lines.shift();
    organization = lines.shift() || '';
    organizationDetails = lines.join(', ');
  }
  if (!organization) {
    for (const footer of footers) organization = organization || operatorFromFooter(footer);
    if (organization) notes.push('Operator taken from the copyright line: check it.');
  }

  // Everything except the page chrome becomes the policy text.
  const root = findOne(byName(['main']), doc.children) || findOne(byName(['body']), doc.children) || doc;
  const navigation = findAll(byName(['nav']), root.children || []);
  const chrome = [['header', header], ['title', h1], ['date', dateNode], ['operator', operator && operator.node]]
    .concat(footers.map((node) => ['footer', node]), navigation.map((node) => ['navigation', node]));
  // What was moved out of the text, so callers (and tests) can see exactly what isn't in `content`.
  const lifted = [];
  for (const [kind, node] of chrome) {
    if (!node) continue;
    lifted.push({ kind, text: textOf(node) });
    if (node !== root && contains(root, node)) removeElement(node);
  }
  const { html: content, removed } = cleanDomNodes(root.children || []);

  const paragraphs = findAll(byName(['p']), root.children || []);
  const appName = nameFromIntro(paragraphs, shortName) || shortName;
  if (!appName) notes.push("Couldn't find the app's name: fill it in.");

  let effectiveDate = dateLine ? dateLine.iso : '';
  if (!effectiveDate) {
    const match = DATE_IN_TEXT.exec(textOf(doc));
    effectiveDate = (match && parseLooseDate(match[1])) || '';
  }
  if (!effectiveDate) {
    effectiveDate = todayIso();
    notes.push("Couldn't find an effective date, so it is set to today (" + formatLongDate(effectiveDate) + ').');
  } else if (dateLine && !dateLine.effective) {
    notes.push('Effective date taken from the "last updated" line: check it.');
  }

  if (!organization) notes.push("Couldn't find who operates the app: fill in the operator.");
  if (!content) notes.push("Couldn't find any policy text in this file.");

  const contactEmail = findAll((node) => isTag(node) && node.name === 'a' && /^mailto:/i.test(getAttributeValue(node, 'href') || ''), root.children || [])
    .map((node) => emailFromMailto(getAttributeValue(node, 'href')))
    .find(Boolean) || '';

  if (legacyUrl) {
    notes.push('This page was saved from ' + legacyUrl + '. After publishing, update the store listing to the new address and redirect the old page.');
  }

  return {
    fields: {
      slug: slugify(shortName || appName),
      appName,
      organization,
      organizationDetails,
      summary: description.slice(0, 300),
      contactEmail,
      effectiveDate,
      content,
      legacyUrl,
      internalNotes: internal.join('\n\n').slice(0, 5000),
    },
    notes,
    removed,
    lifted,
  };
}

module.exports = { importPolicyHtml };
