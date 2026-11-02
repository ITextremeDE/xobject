import type { ComponentProps } from 'react';
import { Table } from '@/components/ui/table';
import { cn } from '@/lib/utils';

// Definition/account tables fit their settings pane; business-record tables
// retain their independent column and horizontal scrolling behavior.
export function SettingsTable({ className, ...props }: ComponentProps<typeof Table>) {
  return <Table className={cn('table-fixed [&_th]:whitespace-normal [&_th]:[overflow-wrap:anywhere] [&_td]:whitespace-normal [&_td]:[overflow-wrap:anywhere]', className)} {...props} />;
}
