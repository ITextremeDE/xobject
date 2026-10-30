import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { cn } from 'cn';

// Dismiss on the left; reset and the primary form action on the right.
export function DialogActions({ onClose, closeLabel, disabled = false, flush = true, children }: {
  onClose: () => void; closeLabel?: string; disabled?: boolean; flush?: boolean; children?: ReactNode;
}) {
  const { t } = useTranslation();
  return <DialogFooter className={cn('shrink-0 sm:justify-between', flush && 'mx-0 mb-0')}>
    <Button type="button" variant="outline" disabled={disabled} onClick={onClose}>{closeLabel ?? t('close')}</Button>
    {children ? <div className="flex flex-col gap-2 sm:flex-row">{children}</div> : null}
  </DialogFooter>;
}
