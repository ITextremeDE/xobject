import { useTranslation } from 'react-i18next';
import { keyboardCommands, saveShortcutLabel, workspaceSearchShortcutLabel } from '@/lib/keyboard';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';

export function KeyboardHelp({ open, onOpenChange, finalFocus }: {
  open: boolean; onOpenChange: (open: boolean) => void; finalFocus: () => HTMLElement | true;
}) {
  const { t } = useTranslation();
  const rows = [
    ['Tab / Shift + Tab', 'focusShortcut'], ['↑ ↓ ← →', 'arrowsShortcut'],
    ['Enter / Space', 'activateShortcut'], ['Escape', 'escapeShortcut'],
    [workspaceSearchShortcutLabel, keyboardCommands.workspaceSearch.label], [saveShortcutLabel, keyboardCommands.save.label], [keyboardCommands.search.key, keyboardCommands.search.label],
  ];
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent showCloseButton={false} finalFocus={finalFocus}>
      <DialogHeader><DialogTitle>{t('keyboardHelp')}</DialogTitle><DialogDescription>{t('keyboardHelpDescription')}</DialogDescription></DialogHeader>
      <Table><TableHeader><TableRow><TableHead>{t('keys')}</TableHead><TableHead>{t('action')}</TableHead></TableRow></TableHeader><TableBody>{rows.map(([keys, label]) => <TableRow key={label}><TableCell><Kbd>{keys}</Kbd></TableCell><TableCell className="whitespace-normal">{t(label)}</TableCell></TableRow>)}</TableBody></Table>
      <DialogClose render={<Button variant="outline" />}>{t('close')}</DialogClose>
    </DialogContent>
  </Dialog>;
}
