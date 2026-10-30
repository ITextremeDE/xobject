import { DialogActions } from './dialog-actions';
import { keyboardCommands, saveShortcutLabel } from '@/lib/keyboard';
import { Kbd } from '@/components/ui/kbd';
import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Language, Labels } from '@xobject/contracts';
import { api, ApiError } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field';
import { TranslatedLabelInput, cleanLabels, hasLabel } from './translated-label-input';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';
import { FieldEditorDialog } from './field-attributes-dialog';
import { ErrorNotice } from './feedback';

type Kind = 'workspace' | 'object' | 'field';
type Props = { kind: Kind; workspaceId?: string; objectTypeId?: string; onClose: () => void; onCreated: (id: string) => void; onDirtyChange?: (dirty: boolean) => void; onBusyChange?: (busy: boolean) => void; finalFocus?: () => HTMLElement | true };
export function DefinitionDialog(props: Props) {
  if (props.kind === 'field') return <FieldEditorDialog objectTypeId={props.objectTypeId} onClose={props.onClose} onCreated={props.onCreated} onDirtyChange={props.onDirtyChange ?? (() => {})} onBusyChange={props.onBusyChange ?? (() => {})} finalFocus={props.finalFocus} />;
  return <DefinitionForm {...props} />;
}
function DefinitionForm({ kind, workspaceId, objectTypeId, onClose, onCreated, onDirtyChange, onBusyChange, finalFocus }: Props) {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [labels, setLabels] = useState<Labels>({});
  const [language, setLanguage] = useState<Language>(i18n.language === 'de' ? 'de' : 'en');
  const title = t(kind === 'workspace' ? 'newWorkspace' : kind === 'object' ? 'newObject' : 'newField');
  const mutation = useMutation({ mutationFn: async () => {
    if (kind === 'workspace') return api('create_workspace', { name: name.trim(), code, defaultLanguage: language });
    const translated = cleanLabels(labels);
    if (!hasLabel(translated)) throw new ApiError(400, 'A label is required');
    if (kind === 'object' && workspaceId) return api('create_object_type', { workspaceId, technicalName: code, labels: translated });
    if (kind === 'field' && objectTypeId) return api('create_field', { objectTypeId, technicalName: code, labels: translated });
    throw new ApiError(400, 'Missing context');
  }, onSuccess: result => onCreated(result.id) });
  const valid = (kind === 'workspace' ? Boolean(name.trim()) && /^[a-z][a-z0-9]*$/.test(code) && code.length <= 61 : hasLabel(cleanLabels(labels)) && /^[a-z][a-z0-9_]*$/.test(code) && code.length <= 63);
  const dirty = Boolean(name || code || Object.values(labels).some(Boolean));
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange?.(mutation.isPending); }, [mutation.isPending, onBusyChange]);
  function propose(value: string) {
    if (!codeTouched) setCode(value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
      .replace(kind === 'workspace' ? /[^a-z0-9]/g : /[^a-z0-9]+/g, kind === 'workspace' ? '' : '_').replace(/^[^a-z]+|_+$/g, ''));
  }
  return <Dialog open onOpenChange={open => { if (!open && !mutation.isPending) onClose(); }}>
    <DialogContent closeButtonDisabled={mutation.isPending} finalFocus={finalFocus ?? (() => {
      const origin = document.querySelector<HTMLElement>(`[data-definition-trigger="${kind}"]`);
      return origin?.getClientRects().length ? origin : document.querySelector<HTMLElement>('[data-slot="sidebar-trigger"]') ?? true;
    })}>
      <DialogHeader className="pr-8"><DialogTitle>{title}</DialogTitle><DialogDescription>{t(kind === 'workspace' ? 'workspaceHelp' : kind === 'object' ? 'objectDescription' : 'fieldDescription')}</DialogDescription></DialogHeader>
      <form data-shortcut-submit id="definition-form" onSubmit={event => { event.preventDefault(); if (valid && !mutation.isPending) mutation.mutate(); }}>
        <FieldGroup>
          {mutation.isError ? <ErrorNotice error={mutation.error} /> : null}
          {kind === 'workspace' ? <Field><FieldLabel htmlFor="workspace-name">{t('workspaceName')}</FieldLabel><Input id="workspace-name" autoFocus required maxLength={200} value={name} onChange={event => { setName(event.target.value); propose(event.target.value); }} disabled={mutation.isPending} /></Field> : <TranslatedLabelInput autoFocus id="definition-label" value={labels} disabled={mutation.isPending} onChange={next => { if (next.en !== labels.en) propose(next.en ?? ''); setLabels(next); }} />}

          <Field><FieldLabel htmlFor="technical-name">{t(kind === 'workspace' ? 'code' : 'technicalName')}</FieldLabel><Input id="technical-name" required value={code} maxLength={kind === 'workspace' ? 61 : 63} pattern={kind === 'workspace' ? '[a-z][a-z0-9]*' : '[a-z][a-z0-9_]*'} onChange={event => { setCodeTouched(true); setCode(event.target.value); }} disabled={mutation.isPending} /><FieldDescription>{t(kind === 'workspace' ? 'codeHelp' : 'technicalHelp')}</FieldDescription></Field>
          {kind === 'workspace' ? <Field><FieldLabel htmlFor="default-language">{t('defaultLanguage')}</FieldLabel><NativeSelect id="default-language" value={language} onChange={event => setLanguage(event.target.value as Language)} disabled={mutation.isPending}><NativeSelectOption value="de">Deutsch</NativeSelectOption><NativeSelectOption value="en">English</NativeSelectOption></NativeSelect></Field> : null}
        </FieldGroup>
      </form>
      <DialogActions flush={false} onClose={onClose} closeLabel={t('cancel')} disabled={mutation.isPending}><Button form="definition-form" type="submit" aria-keyshortcuts={keyboardCommands.save.aria} disabled={!valid || mutation.isPending}>{mutation.isPending ? t('saving') : t('create')}<Kbd>{saveShortcutLabel}</Kbd></Button></DialogActions>
    </DialogContent>
  </Dialog>;
}
