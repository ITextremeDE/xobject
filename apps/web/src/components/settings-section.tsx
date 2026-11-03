import type { ComponentProps } from 'react';
import { cn } from 'cn';

// Shared second surface level for settings sections and record form groups.
// Apply it explicitly at group boundaries, never to Field primitives or nested rows.
const settingsSectionClassName = 'flex min-w-0 flex-col gap-5 rounded-xl bg-muted/50 p-4 sm:p-5';

export function SettingsSection({ className, ...props }: ComponentProps<'section'>) {
  return <section data-slot="settings-section" className={cn(settingsSectionClassName, className)} {...props} />;
}
