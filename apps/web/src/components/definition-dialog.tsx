import { XIcon } from 'lucide-react';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Language } from '@xobject/contracts';
import { api, ApiError } from '@/lib/api';
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';
import { ErrorNotice } from './feedback';

type Kind = 'workspace' | 'object' | 'field';
type Props = { kind: Kind; workspaceId?: string; objectTypeId?: string; onClose: () => void; onCreated: (id: string) => void };
export function DefinitionDialog({ kind, workspaceId, objectTypeId, onClose, onCreated }: Props) {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [de, setDe] = useState('');
  const [en, setEn] = useState('');
  const [language, setLanguage] = useState<Language>(i18n.language === 'de' ? 'de' : 'en');
  const title = t(kind === 'workspace' ? 'newWorkspace' : kind === 'object' ? 'newObject' : 'newField');
  const mutation = useMutation({ mutationFn: async () => {
    if (kind === 'workspace') return api('create_workspace', { name: name.trim(), code, defaultLanguage: language });
    const labels = { ...(de.trim() ? { de: de.trim() } : {}), ...(en.trim() ? { en: en.trim() } : {}) };
    if (!Object.keys(labels).length) throw new ApiError(400, 'A label is required');
    if (kind === 'object' && workspaceId) return api('create_object_type', { workspaceId, technicalName: code, labels });
    if (kind === 'field' && objectTypeId) return api('create_field', { objectTypeId, technicalName: code, labels });
    throw new ApiError(400, 'Missing context');
  }, onSuccess: result => onCreated(result.id) });
  function propose(value: string) {
    if (!codeTouched) setCode(value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
      .replace(kind === 'workspace' ? /[^a-z0-9]/g : /[^a-z0-9]+/g, kind === 'workspace' ? '' : '_').replace(/^[^a-z]+|_+$/g, ''));
  }
  return <Dialog open onOpenChange={open => { if (!open && !mutation.isPending) onClose(); }}>
    <DialogContent showCloseButton={false}>
      <DialogClose asChild><Button variant="ghost" size="icon" className="absolute right-2 top-2" aria-label={t('close')} disabled={mutation.isPending}><XIcon /></Button></DialogClose>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{t(kind === 'workspace' ? 'workspaceHelp' : kind === 'object' ? 'objectDescription' : 'fieldDescription')}</DialogDescription></DialogHeader>
      <form id="definition-form" onSubmit={event => { event.preventDefault(); mutation.mutate(); }}>
        <FieldGroup>
          {mutation.isError ? <ErrorNotice error={mutation.error} /> : null}
          {kind === 'workspace' ? <Field><FieldLabel htmlFor="workspace-name">{t('workspaceName')}</FieldLabel><Input id="workspace-name" autoFocus required maxLength={200} value={name} onChange={event => { setName(event.target.value); propose(event.target.value); }} disabled={mutation.isPending} /></Field> : <>
            <Field><FieldLabel htmlFor="label-de">{t('germanLabel')}</FieldLabel><Input id="label-de" autoFocus value={de} maxLength={200} required={!en.trim()} onChange={event => setDe(event.target.value)} disabled={mutation.isPending} /></Field>
            <Field><FieldLabel htmlFor="label-en">{t('englishLabel')}</FieldLabel><Input id="label-en" value={en} maxLength={200} required={!de.trim()} onChange={event => { setEn(event.target.value); propose(event.target.value); }} disabled={mutation.isPending} /><FieldDescription>{t('labelsHelp')}</FieldDescription></Field>
          </>}
          <Field><FieldLabel htmlFor="technical-name">{t(kind === 'workspace' ? 'code' : 'technicalName')}</FieldLabel><Input id="technical-name" required value={code} maxLength={kind === 'workspace' ? 61 : 63} pattern={kind === 'workspace' ? '[a-z][a-z0-9]*' : '[a-z][a-z0-9_]*'} onChange={event => { setCodeTouched(true); setCode(event.target.value); }} disabled={mutation.isPending} /><FieldDescription>{t(kind === 'workspace' ? 'codeHelp' : 'technicalHelp')}</FieldDescription></Field>
          {kind === 'workspace' ? <Field><FieldLabel htmlFor="default-language">{t('defaultLanguage')}</FieldLabel><NativeSelect id="default-language" value={language} onChange={event => setLanguage(event.target.value as Language)} disabled={mutation.isPending}><NativeSelectOption value="de">Deutsch</NativeSelectOption><NativeSelectOption value="en">English</NativeSelectOption></NativeSelect></Field> : null}
        </FieldGroup>
      </form>
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={mutation.isPending}>{t('cancel')}</Button><Button form="definition-form" type="submit" disabled={mutation.isPending}>{mutation.isPending ? t('saving') : t('create')}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
