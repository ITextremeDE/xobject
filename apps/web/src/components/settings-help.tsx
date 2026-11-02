import type { ReactNode } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldDescription } from '@/components/ui/field';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export function SettingsHelp({ title, children }: { title: string; children: ReactNode }) {
  return <Collapsible className="min-w-0">
    <CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" className="max-w-full justify-start whitespace-normal px-0 text-left" />}>
      {title}<ChevronDownIcon data-icon="inline-end" />
    </CollapsibleTrigger>
    <CollapsibleContent><FieldDescription className="pt-2">{children}</FieldDescription></CollapsibleContent>
  </Collapsible>;
}
