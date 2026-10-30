import { useLayoutEffect } from 'react';
import { colorForeground, defaultWorkspaceAppearance, type WorkspaceAppearance } from '@xobject/contracts';
import { workspaceThemes, workspaceChartPalettes } from './workspace-theme-palettes';
import { workspacePalettes } from './workspace-palettes';

// Font names, families and packages come from @shadcn/font-* registry items (4.23.0).
export const workspaceFontOptions = [
  {
    "value": "inter",
    "label": "Inter",
    "family": "'Inter Variable', sans-serif"
  },
  {
    "value": "noto-sans",
    "label": "Noto Sans",
    "family": "'Noto Sans Variable', sans-serif"
  },
  {
    "value": "nunito-sans",
    "label": "Nunito Sans",
    "family": "'Nunito Sans Variable', sans-serif"
  },
  {
    "value": "figtree",
    "label": "Figtree",
    "family": "'Figtree Variable', sans-serif"
  },
  {
    "value": "roboto",
    "label": "Roboto",
    "family": "'Roboto Variable', sans-serif"
  },
  {
    "value": "raleway",
    "label": "Raleway",
    "family": "'Raleway Variable', sans-serif"
  },
  {
    "value": "dm-sans",
    "label": "DM Sans",
    "family": "'DM Sans Variable', sans-serif"
  },
  {
    "value": "public-sans",
    "label": "Public Sans",
    "family": "'Public Sans Variable', sans-serif"
  },
  {
    "value": "outfit",
    "label": "Outfit",
    "family": "'Outfit Variable', sans-serif"
  },
  {
    "value": "jetbrains-mono",
    "label": "JetBrains Mono",
    "family": "'JetBrains Mono Variable', monospace"
  },
  {
    "value": "geist",
    "label": "Geist",
    "family": "'Geist Variable', sans-serif"
  },
  {
    "value": "geist-mono",
    "label": "Geist Mono",
    "family": "'Geist Mono Variable', monospace"
  },
  {
    "value": "lora",
    "label": "Lora",
    "family": "'Lora Variable', serif"
  },
  {
    "value": "merriweather",
    "label": "Merriweather",
    "family": "'Merriweather Variable', serif"
  },
  {
    "value": "playfair-display",
    "label": "Playfair Display",
    "family": "'Playfair Display Variable', serif"
  },
  {
    "value": "noto-serif",
    "label": "Noto Serif",
    "family": "'Noto Serif Variable', serif"
  },
  {
    "value": "roboto-slab",
    "label": "Roboto Slab",
    "family": "'Roboto Slab Variable', serif"
  },
  {
    "value": "oxanium",
    "label": "Oxanium",
    "family": "'Oxanium Variable', sans-serif"
  },
  {
    "value": "manrope",
    "label": "Manrope",
    "family": "'Manrope Variable', sans-serif"
  },
  {
    "value": "space-grotesk",
    "label": "Space Grotesk",
    "family": "'Space Grotesk Variable', sans-serif"
  },
  {
    "value": "montserrat",
    "label": "Montserrat",
    "family": "'Montserrat Variable', sans-serif"
  },
  {
    "value": "ibm-plex-sans",
    "label": "IBM Plex Sans",
    "family": "'IBM Plex Sans Variable', sans-serif"
  },
  {
    "value": "source-sans-3",
    "label": "Source Sans 3",
    "family": "'Source Sans 3 Variable', sans-serif"
  },
  {
    "value": "instrument-sans",
    "label": "Instrument Sans",
    "family": "'Instrument Sans Variable', sans-serif"
  },
  {
    "value": "eb-garamond",
    "label": "EB Garamond",
    "family": "'EB Garamond Variable', serif"
  },
  {
    "value": "instrument-serif",
    "label": "Instrument Serif",
    "family": "'Instrument Serif', serif"
  }
] as const;
const fontImports = {
  'inter': () => import('@fontsource-variable/inter'),
  'noto-sans': () => import('@fontsource-variable/noto-sans'),
  'nunito-sans': () => import('@fontsource-variable/nunito-sans'),
  'figtree': () => import('@fontsource-variable/figtree'),
  'roboto': () => import('@fontsource-variable/roboto'),
  'raleway': () => import('@fontsource-variable/raleway'),
  'dm-sans': () => import('@fontsource-variable/dm-sans'),
  'public-sans': () => import('@fontsource-variable/public-sans'),
  'outfit': () => import('@fontsource-variable/outfit'),
  'jetbrains-mono': () => import('@fontsource-variable/jetbrains-mono'),
  'geist': () => import('@fontsource-variable/geist'),
  'geist-mono': () => import('@fontsource-variable/geist-mono'),
  'lora': () => import('@fontsource-variable/lora'),
  'merriweather': () => import('@fontsource-variable/merriweather'),
  'playfair-display': () => import('@fontsource-variable/playfair-display'),
  'noto-serif': () => import('@fontsource-variable/noto-serif'),
  'roboto-slab': () => import('@fontsource-variable/roboto-slab'),
  'oxanium': () => import('@fontsource-variable/oxanium'),
  'manrope': () => import('@fontsource-variable/manrope'),
  'space-grotesk': () => import('@fontsource-variable/space-grotesk'),
  'montserrat': () => import('@fontsource-variable/montserrat'),
  'ibm-plex-sans': () => import('@fontsource-variable/ibm-plex-sans'),
  'source-sans-3': () => import('@fontsource-variable/source-sans-3'),
  'instrument-sans': () => import('@fontsource-variable/instrument-sans'),
  'eb-garamond': () => import('@fontsource-variable/eb-garamond'),
  'instrument-serif': () => import('@fontsource/instrument-serif/latin-400.css'),
};
const loadedFonts = new Map<string, Promise<unknown>>();
export function loadWorkspaceFont(font: WorkspaceAppearance['font']) {
  if (!loadedFonts.has(font)) loadedFonts.set(font, fontImports[font]().catch(error => { loadedFonts.delete(font); throw error; }));
  return loadedFonts.get(font)!;
}
const radii = { default: '0.625rem', none: '0rem', small: '0.375rem', medium: '0.625rem', large: '1rem' };
export function workspaceAppearanceTokens(appearance: WorkspaceAppearance, dark: boolean): Record<string, string> {
  const palette: Record<string, string> = workspacePalettes[appearance.baseColor][dark ? 'dark' : 'light'];
  const accents: Record<string, string> = workspaceThemes[appearance.theme][dark ? 'dark' : 'light'];
  const charts: Record<string, string> = workspaceChartPalettes[appearance.chartColor][dark ? 'dark' : 'light'];
  const colors = { ...palette, ...accents, ...charts };
  const tokens: Record<string, string> = Object.fromEntries(Object.entries(colors).map(([key, value]) => [`--${key}`, value]));
  tokens['--radius'] = radii[appearance.radius];
  tokens['--workspace-font'] = workspaceFontOptions.find(item => item.value === appearance.font)!.family;
  tokens['--workspace-heading-font'] = appearance.fontHeading === 'inherit' ? tokens['--workspace-font'] : workspaceFontOptions.find(item => item.value === appearance.fontHeading)!.family;
  for (const [key, color] of [['primary', appearance.primaryColor], ['secondary', appearance.secondaryColor]] as const) {
    if (color) { tokens[`--${key}`] = color; tokens[`--${key}-foreground`] = colorForeground(color); }
  }
  if (appearance.primaryColor) { tokens['--sidebar-primary'] = tokens['--primary']; tokens['--sidebar-primary-foreground'] = tokens['--primary-foreground']; }
  return tokens;
}

/** Menu presets are scoped to menu surfaces; ordinary page accents remain unchanged. */
export function workspaceMenuTokens(appearance: WorkspaceAppearance, dark: boolean): { dark: boolean; style: Record<string, string> } {
  // shadcn's inverted preset adds a dark surface, including when the page itself is light.
  const menuDark = appearance.menuColor.startsWith('inverted') || dark;
  const tokens = workspaceAppearanceTokens(appearance, menuDark);
  const style = { ...tokens };
  if (appearance.menuAccent === 'bold') { style['--accent'] = tokens['--primary']; style['--accent-foreground'] = tokens['--primary-foreground']; }
  const translucent = appearance.menuColor.endsWith('-translucent');
  if (translucent) style['--popover'] = `color-mix(in oklch, ${tokens['--popover']} 70%, transparent)`;
  style['backdropFilter'] = translucent ? 'blur(24px) saturate(150%)' : 'none';
  style['WebkitBackdropFilter'] = style['backdropFilter'];
  return { dark: menuDark, style };
}

/** Root tokens also reach portalled dialogs/menus. Cleanup prevents workspace or sign-out leakage. */
export function useWorkspaceAppearance(appearance = defaultWorkspaceAppearance) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const keys = Object.keys(workspaceAppearanceTokens(appearance, false));
    const previous = new Map(keys.map(key => [key, root.style.getPropertyValue(key)]));
    const apply = () => { for (const [key, value] of Object.entries(workspaceAppearanceTokens(appearance, root.classList.contains('dark')))) root.style.setProperty(key, value); };
    apply();
    void Promise.all([loadWorkspaceFont(appearance.font), ...(appearance.fontHeading === 'inherit' ? [] : [loadWorkspaceFont(appearance.fontHeading)])]).catch(() => { /* Local font failure retains the font stack's system fallback. */ });
    const observer = new MutationObserver(apply);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => { observer.disconnect(); for (const [key, value] of previous) { if (value) root.style.setProperty(key, value); else root.style.removeProperty(key); } };
  }, [appearance]);
}
