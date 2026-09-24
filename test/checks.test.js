'use strict';

const assert = require('assert');
const { reviewPolicy, findPlaceholders } = require('../server/lib/checks');
const { todayIso, addDays } = require('../shared/dates');

const COMPLETE = [
  '<h2>What we collect</h2><p>' + 'We collect your name and phone number to run the app. '.repeat(20) + '</p>',
  '<h2>Third-party services</h2><p>We use Google Play Services.</p>',
  '<h2>Deletion</h2><p>Ask us to delete your data at any time.</p>',
  '<h2>Children</h2><p>The app is not meant for children under 13.</p>',
  '<h2>Contact</h2><p><a href="mailto:privacy@example.test">privacy@example.test</a></p>',
].join('');

function policy(overrides) {
  return Object.assign({ appName: 'App', organization: 'Org', effectiveDate: todayIso(), content: COMPLETE }, overrides);
}

describe('findPlaceholders', () => {
  it('finds bracketed, templated and TODO placeholders', () => {
    assert.deepStrictEqual(
      findPlaceholders(['Office: [REGISTERED OFFICE ADDRESS], contact [Your Email], app {{ app_name }}, TODO, <YOUR NAME>']),
      ['[REGISTERED OFFICE ADDRESS]', '[Your Email]', '{{ app_name }}', '<YOUR NAME>', 'TODO'],
    );
  });

  it('leaves ordinary brackets alone', () => {
    assert.deepStrictEqual(findPlaceholders(['See note [1], the 2023 list [a], and (SLE).']), []);
  });
});

describe('reviewPolicy', () => {
  it('passes a complete policy', () => {
    const review = reviewPolicy(policy());
    assert.deepStrictEqual(review.placeholders, []);
    assert.deepStrictEqual(review.warnings, []);
    assert.strictEqual(review.canPublish, true);
  });

  it('blocks publishing while placeholders remain, including inside links and fields', () => {
    const review = reviewPolicy(policy({
      organization: '[COMPANY NAME]',
      content: COMPLETE + '<p><a href="mailto:[OFFICER EMAIL]">Email us</a></p>',
    }));
    assert.deepStrictEqual(review.placeholders, ['[COMPANY NAME]', '[OFFICER EMAIL]']);
    assert.strictEqual(review.canPublish, false);
  });

  it('advises on what stores look for', () => {
    const review = reviewPolicy(policy({ content: '<p>We collect data.</p>' }));
    const codes = review.warnings.map((warning) => warning.code);
    assert.deepStrictEqual(codes, ['contact', 'deletion', 'children', 'third-parties', 'short']);
    assert.strictEqual(review.canPublish, true);
  });

  it('counts the contact email field as a contact', () => {
    const review = reviewPolicy(policy({ content: COMPLETE.replace(/<h2>Contact.*$/, ''), contactEmail: 'a@b.test' }));
    assert.ok(!review.warnings.some((warning) => warning.code === 'contact'));
  });

  it('flags old and future effective dates', () => {
    assert.strictEqual(reviewPolicy(policy({ effectiveDate: addDays(todayIso(), -400) })).warnings[0].code, 'stale');
    assert.strictEqual(reviewPolicy(policy({ effectiveDate: addDays(todayIso(), 30) })).warnings[0].code, 'future');
  });
});
