import { DialogActions } from './dialog-actions';
import { useTranslation } from 'react-i18next';
import { keyboardCommands, saveShortcutLabel, workspaceSearchShortcutLabel } from '@/lib/keyboard';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
    <DialogContent  className="flex max-h-[85svh] flex-col overflow-hidden p-0 sm:max-w-lg" finalFocus={finalFocus}>
      <DialogHeader className="shrink-0 px-4 pt-4 pr-12"><DialogTitle>{t('keyboardHelp')}</DialogTitle><DialogDescription>{t('keyboardHelpDescription')}</DialogDescription></DialogHeader>
      <div className="min-h-0 overflow-y-auto px-4"><Table><TableHeader><TableRow><TableHead>{t('keys')}</TableHead><TableHead>{t('action')}</TableHead></TableRow></TableHeader><TableBody>{rows.map(([keys, label]) => <TableRow key={label}><TableCell><Kbd>{keys}</Kbd></TableCell><TableCell className="whitespace-normal">{t(label)}</TableCell></TableRow>)}</TableBody></Table></div>
      <DialogActions onClose={() => onOpenChange(false)} />
    </DialogContent>
  </Dialog>;
}
