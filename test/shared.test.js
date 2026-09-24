'use strict';

const assert = require('assert');
const { slugify, slugProblem } = require('../shared/slug');
const { parseLooseDate, formatLongDate, formatShortDate, isIsoDate, addDays } = require('../shared/dates');

describe('slugs', () => {
  it('makes addresses from app names', () => {
    assert.strictEqual(slugify('DBOCWWB Labour Welfare'), 'dbocwwb-labour-welfare');
    assert.strictEqual(slugify('  Café & Bar — App!  '), 'cafe-and-bar-app');
    assert.strictEqual(slugify('a'.repeat(80)), 'a'.repeat(64));
  });

  it('explains addresses that cannot be used', () => {
    assert.strictEqual(slugProblem('my-app'), null);
    assert.ok(slugProblem(''));
    assert.ok(slugProblem('My App'));
    assert.ok(slugProblem('-app'));
    assert.ok(slugProblem('admin'));
    assert.ok(slugProblem('api'));
  });
});

describe('dates', () => {
  it('reads the formats policies use', () => {
    const cases = {
      '23 September 2026': '2026-09-23',
      '1 July 2025': '2025-07-01',
      'September 23, 2026': '2026-09-23',
      '23rd Sept 2026': '2026-09-23',
      '2026-09-23': '2026-09-23',
      '23/09/2026': '2026-09-23',
      '09/23/2026': '2026-09-23',
      '05/03/2025': '2025-03-05',
      'July 2025': '2025-07-01',
      '31 February 2026': null,
      'soon': null,
    };
    Object.keys(cases).forEach((text) => assert.strictEqual(parseLooseDate(text), cases[text], text));
  });

  it('formats and validates calendar dates', () => {
    assert.strictEqual(formatLongDate('2026-09-23'), '23 September 2026');
    assert.strictEqual(formatShortDate('2025-07-01'), '1 Jul 2025');
    assert.strictEqual(isIsoDate('2024-02-29'), true);
    assert.strictEqual(isIsoDate('2025-02-29'), false);
    assert.strictEqual(addDays('2026-12-31', 1), '2027-01-01');
  });
});
