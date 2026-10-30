import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultWorkspaceAppearance, workspaceThemes, workspaceChartColors, workspaceHeadingFonts } from '@xobject/contracts';
import { workspaceAppearanceTokens } from '../src/lib/workspace-appearance.ts';

const chart = (tokens: Record<string, string>) => [1, 2, 3, 4, 5].map(index => tokens[`--chart-${index}`]);

test('base surfaces, theme accents and chart colors vary independently in both modes', () => {
  for (const dark of [false, true]) {
    const base = workspaceAppearanceTokens(defaultWorkspaceAppearance, dark);
    const themed = workspaceAppearanceTokens({ ...defaultWorkspaceAppearance, theme: 'blue' }, dark);
    const charts = workspaceAppearanceTokens({ ...defaultWorkspaceAppearance, chartColor: 'amber' }, dark);
    const combined = workspaceAppearanceTokens({ ...defaultWorkspaceAppearance, baseColor: 'taupe', theme: 'blue', chartColor: 'amber' }, dark);
    assert.notEqual(themed['--primary'], base['--primary']);
    assert.equal(themed['--background'], base['--background']);
    assert.deepEqual(chart(themed), chart(base));
    assert.equal(charts['--primary'], base['--primary']);
    assert.notDeepEqual(chart(charts), chart(base));
    assert.equal(combined['--primary'], themed['--primary']);
    assert.deepEqual(chart(combined), chart(charts));
    assert.equal(combined['--muted'], workspaceAppearanceTokens({ ...defaultWorkspaceAppearance, baseColor: 'taupe' }, dark)['--muted']);
  }
});

test('explicit primary and secondary colors override themes without changing charts or body fonts', () => {
  for (const dark of [false, true]) {
    const appearance = { ...defaultWorkspaceAppearance, theme: 'blue' as const, chartColor: 'green' as const };
    const base = workspaceAppearanceTokens(appearance, dark);
    const custom = workspaceAppearanceTokens({ ...appearance, primaryColor: '#ffffff', secondaryColor: '#000000' }, dark);
    assert.equal(custom['--primary'], '#ffffff');
    assert.equal(custom['--primary-foreground'], '#000000');
    assert.equal(custom['--secondary'], '#000000');
    assert.equal(custom['--secondary-foreground'], '#ffffff');
    assert.equal(custom['--sidebar-primary'], '#ffffff');
    assert.deepEqual(chart(custom), chart(base));
    assert.equal(custom['--workspace-font'], base['--workspace-font']);
  }
});

test('every pinned theme/chart palette has complete tokens and heading fonts inherit or vary independently', () => {
  for (const dark of [false, true]) {
    for (const theme of workspaceThemes) {
      const tokens = workspaceAppearanceTokens({ ...defaultWorkspaceAppearance, theme }, dark);
      assert.ok(tokens['--primary'] && tokens['--primary-foreground'] && tokens['--secondary']);
    }
    for (const chartColor of workspaceChartColors) assert.ok(chart(workspaceAppearanceTokens({ ...defaultWorkspaceAppearance, chartColor }, dark)).every(Boolean));
    for (const fontHeading of workspaceHeadingFonts) {
      const tokens = workspaceAppearanceTokens({ ...defaultWorkspaceAppearance, font: 'inter', fontHeading }, dark);
      assert.match(tokens['--workspace-font'], /Inter Variable/);
      if (fontHeading === 'inherit') assert.equal(tokens['--workspace-heading-font'], tokens['--workspace-font']);
      else if (fontHeading !== 'inter') assert.notEqual(tokens['--workspace-heading-font'], tokens['--workspace-font']);
    }
  }
});

test('all menu surface/accent combinations stay isolated from page tokens in both preview modes', async () => {
  const { workspaceMenuTokens } = await import('../src/lib/workspace-appearance.ts');
  const { workspaceMenuColors, workspaceMenuAccents } = await import('@xobject/contracts');
  for (const dark of [false, true]) for (const menuColor of workspaceMenuColors) for (const menuAccent of workspaceMenuAccents) {
    const appearance = { ...defaultWorkspaceAppearance, theme: 'blue' as const, menuColor, menuAccent };
    const pageBefore = workspaceAppearanceTokens(appearance, dark);
    const menu = workspaceMenuTokens(appearance, dark);
    const menuBase = workspaceAppearanceTokens(appearance, menu.dark);
    assert.equal(menu.dark, dark || menuColor.startsWith('inverted'));
    assert.equal(menu.style['--accent'], menuAccent === 'bold' ? menuBase['--primary'] : menuBase['--accent']);
    assert.equal(menu.style['--accent-foreground'], menuAccent === 'bold' ? menuBase['--primary-foreground'] : menuBase['--accent-foreground']);
    if (menuColor.endsWith('-translucent')) {
      assert.match(menu.style['--popover'], /70%, transparent/);
      assert.match(menu.style.backdropFilter, /blur/);
    } else {
      assert.equal(menu.style['--popover'], menuBase['--popover']);
      assert.equal(menu.style.backdropFilter, 'none');
    }
    assert.deepEqual(workspaceAppearanceTokens(appearance, dark), pageBefore);
  }
});
