import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultWorkspaceAppearance, workspaceThemes, workspaceChartColors, workspaceHeadingFonts, workspaceBaseColors } from '@xobject/contracts';
import { workspacePalettes } from '../src/lib/workspace-palettes.ts';
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
    const custom = workspaceAppearanceTokens({ ...appearance, primaryColor: '#ffffff', secondaryColor: '#000000',secondaryColorDark:'#000000',primaryColorDark:'#ffffff' }, dark);
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

// Registry HSL channel triplets must be complete CSS colors before token application.
test('all configured base colors produce complete CSS color expressions in both modes',()=>{
 for(const dark of [false,true])for(const baseColor of workspaceBaseColors){
  const tokens=workspaceAppearanceTokens({...defaultWorkspaceAppearance,baseColor},dark);
  for(const [name,value] of Object.entries(tokens))if(!['--radius','--workspace-font','--workspace-heading-font'].includes(name))assert.match(value,/^(?:#[0-9a-f]+|(?:oklch|hsl|rgb|color-mix)\()/i,`${baseColor} ${name}: ${value}`);
 }
 assert.equal(workspaceAppearanceTokens({...defaultWorkspaceAppearance,baseColor:'gray'},true)['--background'],'hsl(224 71.4% 4.1%)');
});

test('primary colors and focus rings follow their independent modes; Orbitron stays a separate heading choice',()=>{
 const appearance={...defaultWorkspaceAppearance,primaryColor:'#C81E3A',primaryColorDark:'#F26074',font:'inter' as const,fontHeading:'orbitron' as const};
 const light=workspaceAppearanceTokens(appearance,false),dark=workspaceAppearanceTokens(appearance,true);
 assert.equal(light['--primary'],'#C81E3A');assert.equal(dark['--primary'],'#F26074');
 assert.equal(light['--ring'],'#C81E3A');assert.equal(dark['--sidebar-primary'],'#F26074');
 assert.match(light['--workspace-font'],/Inter/);assert.match(light['--workspace-heading-font'],/Orbitron/);
 assert.notEqual(workspaceAppearanceTokens({...appearance,primaryColorDark:null},true)['--primary'],appearance.primaryColor);
});


test('every base owns the same complete surface/sidebar roles without leaking global or previous-workspace colors', () => {
  const surfaceRole = (key: string) => /^(?:background|foreground|card(?:-foreground)?|popover(?:-foreground)?|muted(?:-foreground)?|accent(?:-foreground)?|border|input|sidebar(?:-.+)?)$/.test(key);
  const required = Object.keys(workspacePalettes.neutral.light).filter(surfaceRole).sort();
  for (const baseColor of workspaceBaseColors) for (const mode of ['light', 'dark'] as const) {
    assert.deepEqual(Object.keys(workspacePalettes[baseColor][mode]).filter(surfaceRole).sort(), required, `${baseColor} ${mode}`);
    const tokens = workspaceAppearanceTokens({ ...defaultWorkspaceAppearance, baseColor }, mode === 'dark');
    assert.equal(tokens['--sidebar'], workspacePalettes[baseColor][mode].sidebar);
    assert.equal(tokens['--sidebar-accent'], workspacePalettes[baseColor][mode]['sidebar-accent']);
  }
  for (const mode of ['light', 'dark'] as const) {
    const gray = workspacePalettes.gray[mode];
    assert.equal(gray.sidebar, gray['primary-foreground']);
    assert.equal(gray['sidebar-accent'], gray.accent);
    assert.equal(gray['sidebar-border'], gray.border);
    assert.notEqual(gray.sidebar, workspacePalettes.neutral[mode].sidebar);
  }
});

test('secondary colors are independent per mode and all portal menus resolve the draft font explicitly', async () => {
  const { workspaceMenuTokens } = await import('../src/lib/workspace-appearance.ts');
  const appearance = { ...defaultWorkspaceAppearance, secondaryColor: '#fef3c7', secondaryColorDark: '#451a03', font: 'lora' as const };
  assert.equal(workspaceAppearanceTokens(appearance, false)['--secondary'], '#fef3c7');
  assert.equal(workspaceAppearanceTokens(appearance, true)['--secondary'], '#451a03');
  assert.notEqual(workspaceAppearanceTokens({ ...appearance, secondaryColorDark: null }, true)['--secondary'], appearance.secondaryColor);
  for (const dark of [false, true]) {
    const menu = workspaceMenuTokens(appearance, dark);
    assert.equal(menu.style.fontFamily, "'Lora Variable', serif");
    assert.equal(menu.style.colorScheme, dark ? 'dark' : 'light');
  }
});
