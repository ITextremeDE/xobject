import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrastRatio, primaryContrastIssues } from '../src/lib/color-contrast';

test('contrast checks distinguish link text, focus borders and the separate sidebar surface', () => {
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  assert.equal(contrastRatio('#123456', '#123456'), 1);
  const colors = { primary: '#000000', ring: '#000000', 'sidebar-ring': '#ffffff', background: '#ffffff', card: '#ffffff', popover: '#ffffff', sidebar: '#000000' };
  assert.deepEqual(primaryContrastIssues(colors), []);
  assert.deepEqual(primaryContrastIssues({ ...colors, primary: '#ffffff' }), ['link:background', 'link:card', 'link:popover']);
  assert.deepEqual(primaryContrastIssues({ ...colors, 'sidebar-ring': '#000000' }), ['focus:sidebar']);
  // This gray meets 3:1 for non-text focus indicators, but not 4.5:1 for normal link text.
  assert.ok(contrastRatio('#888888', '#ffffff') > 3);
  assert.ok(contrastRatio('#888888', '#ffffff') < 4.5);
  assert.deepEqual(primaryContrastIssues({ ...colors, primary: '#888888', ring: '#888888' }), ['link:background', 'link:card', 'link:popover']);
});
