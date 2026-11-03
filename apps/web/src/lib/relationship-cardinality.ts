import type { RelationshipConfiguration } from '@xobject/contracts';

export type RelationshipCardinality = '1:1' | '1:n' | 'n:1' | 'n:m';
type Limits = Pick<RelationshipConfiguration, 'leftMax' | 'rightMax'>;

// A side's maximum counts its opposite records, so the left maximum is
// represented by the second term of the conventional left:right notation.
export function relationshipCardinality(value: Limits): RelationshipCardinality {
  if (value.leftMax === 1) return value.rightMax === 1 ? '1:1' : 'n:1';
  return value.rightMax === 1 ? '1:n' : 'n:m';
}

export function withRelationshipCardinality<T extends Limits>(value: T, cardinality: RelationshipCardinality): T {
  return { ...value,
    leftMax: cardinality === '1:1' || cardinality === 'n:1' ? 1 : null,
    rightMax: cardinality === '1:1' || cardinality === '1:n' ? 1 : null,
  };
}
