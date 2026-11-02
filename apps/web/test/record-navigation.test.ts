import assert from 'node:assert/strict';
import test from 'node:test';
import { recordReturnPath } from '../src/lib/record-navigation';

test('closing a record retains the originating Dashboard filters or object-list page', () => {
  assert.equal(recordReturnPath('/w/itx?object=vehicles&q=Service&page=2', '/w/itx', '/w/itx/objects/vehicles', ''), '/w/itx?object=vehicles&q=Service&page=2');
  assert.equal(recordReturnPath('/w/itx/objects/vehicles?q=Service&sort=keyword&direction=asc&page=3&size=10', '/w/itx', '/w/itx/objects/vehicles', ''), '/w/itx/objects/vehicles?q=Service&sort=keyword&direction=asc&page=3&size=10');
});

test('direct links and untrusted history origins return only to the current object list', () => {
  for (const origin of [undefined, null, 12, {}, 'https://example.com/w/itx', '//example.com', '/w/other', '/w/itx/objects/other', '/w/itx/../other', '/w/itx#other', '/settings']) {
    assert.equal(recordReturnPath(origin, '/w/itx', '/w/itx/objects/vehicles', '?page=2'), '/w/itx/objects/vehicles?page=2');
  }
});
