import assert from 'node:assert/strict';
import test from 'node:test';
import { relationshipCardinality, withRelationshipCardinality, type RelationshipCardinality } from '../src/lib/relationship-cardinality';

// Real asymmetric example: one organization has many contacts, each contact
// belongs to exactly one organization. Minimum counts are independent.
test('global cardinality follows object-pair orientation and preserves required links', () => {
  const organizationContacts = { leftMin: 0, leftMax: null, rightMin: 1, rightMax: 1, directed: true };
  assert.equal(relationshipCardinality(organizationContacts), '1:n');
  const cases: [RelationshipCardinality, number | null, number | null][] = [
    ['1:1', 1, 1], ['1:n', null, 1], ['n:1', 1, null], ['n:m', null, null],
  ];
  for (const [cardinality, leftMax, rightMax] of cases) {
    const next = withRelationshipCardinality(organizationContacts, cardinality);
    assert.deepEqual(next, { ...organizationContacts, leftMax, rightMax });
    assert.equal(relationshipCardinality(next), cardinality);
  }
  assert.equal(organizationContacts.leftMax, null);
});

test('symmetric cardinalities have identical maxima and do not alter minimums', () => {
  for (const cardinality of ['1:1', 'n:m'] as const) {
    for (const minimum of [0, 1]) {
      const next = withRelationshipCardinality({ leftMin: minimum, rightMin: minimum, leftMax: null, rightMax: null }, cardinality);
      assert.equal(next.leftMax, next.rightMax);
      assert.equal(next.leftMin, minimum);
      assert.equal(next.rightMin, minimum);
      assert.equal(relationshipCardinality(next), cardinality);
    }
  }
});
