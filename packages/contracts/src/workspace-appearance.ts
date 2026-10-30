import { z } from 'zod';

// Pinned to shadcn 4.23.0 PRESET_FONTS / PRESET_BASE_COLORS. No arbitrary font or CSS input.
export const workspaceFonts = ["inter", "noto-sans", "nunito-sans", "figtree", "roboto", "raleway", "dm-sans", "public-sans", "outfit", "jetbrains-mono", "geist", "geist-mono", "lora", "merriweather", "playfair-display", "noto-serif", "roboto-slab", "oxanium", "manrope", "space-grotesk", "montserrat", "ibm-plex-sans", "source-sans-3", "instrument-sans", "eb-garamond", "instrument-serif"] as const;
export const workspaceBaseColors = ['neutral', 'stone', 'zinc', 'gray', 'mauve', 'olive', 'mist', 'taupe'] as const;
export const workspaceThemes = ["neutral", "stone", "zinc", "gray", "amber", "blue", "cyan", "emerald", "fuchsia", "green", "indigo", "lime", "orange", "pink", "purple", "red", "rose", "sky", "teal", "violet", "yellow", "mauve", "olive", "mist", "taupe"] as const;
export const workspaceChartColors = workspaceThemes;
export const workspaceHeadingFonts = ['inherit', ...workspaceFonts] as const;
export const workspaceMenuColors = ['default', 'inverted', 'default-translucent', 'inverted-translucent'] as const;
export const workspaceMenuAccents = ['subtle', 'bold'] as const;
export const workspaceRadii = ['default', 'none', 'small', 'medium', 'large'] as const;
export const workspaceAppearanceSchema = z.object({
  baseColor: z.enum(workspaceBaseColors),
  menuColor: z.enum(workspaceMenuColors),
  menuAccent: z.enum(workspaceMenuAccents),
  theme: z.enum(workspaceThemes),
  chartColor: z.enum(workspaceChartColors),
  fontHeading: z.enum(workspaceHeadingFonts),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  radius: z.enum(workspaceRadii),
  font: z.enum(workspaceFonts),
}).strict();
export type WorkspaceAppearance = z.infer<typeof workspaceAppearanceSchema>;
export const defaultWorkspaceAppearance: WorkspaceAppearance = { baseColor: 'neutral', menuColor: 'default', menuAccent: 'subtle', theme: 'neutral', chartColor: 'neutral', fontHeading: 'inherit', primaryColor: null, secondaryColor: null, radius: 'default', font: 'geist' };

/** WCAG sRGB relative luminance; choose the better of black and white for solid custom fills. */
export function colorForeground(hex: string): '#000000' | '#ffffff' {
  const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#000000' : '#ffffff';
}
