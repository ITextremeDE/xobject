/** Contrast of opaque sRGB hex colors after browser resolution of theme expressions. */
export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

export function primaryContrastIssues(colors: Record<string, string>): string[] {
  const issues: string[] = [];
  for (const surface of ['background', 'card', 'popover']) {
    if (contrastRatio(colors.primary, colors[surface]) < 4.5) issues.push(`link:${surface}`);
    if (contrastRatio(colors.ring, colors[surface]) < 3) issues.push(`focus:${surface}`);
  }
  if (contrastRatio(colors['sidebar-ring'], colors.sidebar) < 3) issues.push('focus:sidebar');
  return issues;
}

export function resolveThemeColors(tokens: Record<string, string>): Record<string, string> {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d')!;
  return Object.fromEntries(Object.entries(tokens).filter(([key]) => !['--radius', '--workspace-font', '--workspace-heading-font'].includes(key)).map(([key, color]) => {
    context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
    const rgba = context.getImageData(0, 0, 1, 1).data;
    return [key.slice(2), '#' + [...rgba].slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('')];
  }));
}
