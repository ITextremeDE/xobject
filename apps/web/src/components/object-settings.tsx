import { ClientTablePagination, useClientPagination } from './client-table-pagination';
import { Spinner } from '@/components/ui/spinner';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PlusIcon, ChevronDownIcon } from 'lucide-react';
import type { AuthUser, ObjectDefinition, Workspace } from '@xobject/contracts';
import { api } from '@/lib/api';
import { keyboardCommands, saveShortcutLabel } from '@/lib/keyboard';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { fieldKindKey } from './field-type-settings';
import { DefinitionDialog } from './definition-dialog';
import { FieldAttributesDialog } from './field-attributes-dialog';
import { TranslatedLabelInput, cleanLabels, hasLabel, sameLabels } from './translated-label-input';
import { DefinitionLifecycle, DefinitionJournal } from './definition-lifecycle';
import { Checkbox } from '@/components/ui/checkbox';
import { Link } from 'react-router';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldSet, FieldLegend, FieldSeparator } from '@/components/ui/field';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { ErrorNotice, Loading } from './feedback';

type GuardProps = { onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void };

export function ObjectSettings({ readOnly = false, workspace, user, onDirtyChange, onBusyChange }: GuardProps & { readOnly?: boolean; workspace: Workspace; user: AuthUser }) {
  const { t } = useTranslation();
  const language = user.language ?? workspace.default_language;
  const [showDeleted, setShowDeleted] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDirty, setCreateDirty] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [confirmCreateClose, setConfirmCreateClose] = useState(false);
  const client = useQueryClient();
  function closeCreate() { if (createBusy) return; if (createDirty) setConfirmCreateClose(true); else setCreateOpen(false); }
  const [pendingId, setPendingId] = useState<string | null>(null);
  const types = useQuery({ queryKey: ['types', workspace.id, user.id, language, 'settings', showDeleted], queryFn: () => api('list_object_types', { workspaceId: workspace.id, includeInactive: true, includeDeleted: showDeleted }) });
  const collator = new Intl.Collator(language, { sensitivity: 'base' });
  const sorted = [...(types.data ?? [])].sort((a, b) => collator.compare(a.label, b.label) || a.technicalName.localeCompare(b.technicalName));
  const id = sorted.some(type => type.id === selectedId) ? selectedId : sorted[0]?.id;
  // Keep the chosen identity stable if a renamed label changes alphabetical order.
  useEffect(() => { if (id && selectedId !== id) setSelectedId(id); }, [id, selectedId]);
  const definition = useQuery({ queryKey: ['definition', id, user.id, language], queryFn: () => api('get_object_type', { objectTypeId: id! }), enabled: Boolean(id) });
  useEffect(() => { onDirtyChange(dirty || createDirty); }, [dirty, createDirty, onDirtyChange]);
  useEffect(() => { onBusyChange(busy || createBusy); }, [busy, createBusy, onBusyChange]);
  if (types.isPending) return <Loading />;
  if (types.isError) return <ErrorNotice error={types.error} retry={() => { void types.refetch(); }} />;
  return <FieldGroup>
    {!readOnly ? <div className="flex justify-end"><Button type="button" variant="outline" data-settings-add-object disabled={busy || createBusy} onClick={() => setCreateOpen(true)}><PlusIcon data-icon="inline-start" />{t('newObject')}</Button></div> : null}
    {!sorted.length ? <FieldDescription>{t('noObjects')}</FieldDescription> : <Field data-disabled={busy || undefined}><FieldLabel htmlFor="settings-object">{t('selectObjectType')}</FieldLabel><Select items={sorted.map(type => ({ value: type.id, label: type.state && type.state !== 'active' ? `${type.label} (${t(`definition_${type.state}`)})` : type.label }))} value={id} disabled={busy} onValueChange={value => { if (!value || value === id) return; if (dirty) setPendingId(value); else setSelectedId(value); }}>
      <SelectTrigger id="settings-object" className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent><SelectGroup>{sorted.map(type => <SelectItem key={type.id} value={type.id}>{type.label}{type.state && type.state !== 'active' ? ` (${t(`definition_${type.state}`)})` : ''}</SelectItem>)}</SelectGroup></SelectContent>
    </Select></Field>}
    <Field data-disabled={(busy || dirty) || undefined} orientation="horizontal"><Checkbox id="show-deleted-definitions" checked={showDeleted} disabled={busy || dirty} onCheckedChange={checked => setShowDeleted(checked === true)} /><FieldLabel htmlFor="show-deleted-definitions">{t('showDeletedDefinitions')}</FieldLabel></Field>
    {id ? <>{definition.isPending ? <Loading /> : definition.isError ? <ErrorNotice error={definition.error} retry={() => { void definition.refetch(); }} /> : <ObjectAttributes user={user} canReadContents={Boolean(user.isAdmin)} showDeleted={showDeleted} readOnly={readOnly} key={definition.data.id} definition={definition.data} workspace={workspace} onDirtyChange={setDirty} onBusyChange={setBusy} />}
    </> : null}
    {createOpen ? <DefinitionDialog kind="object" workspaceId={workspace.id} onClose={closeCreate} onDirtyChange={setCreateDirty} onBusyChange={setCreateBusy} finalFocus={() => document.querySelector<HTMLElement>('[data-settings-add-object]') ?? true} onCreated={async id => { await client.invalidateQueries({ queryKey: ['types', workspace.id] }); setCreateOpen(false); setCreateDirty(false); setCreateBusy(false); if (dirty) setPendingId(id); else setSelectedId(id); }} /> : null}
    <AlertDialog open={confirmCreateClose} onOpenChange={setConfirmCreateClose}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('unsaved')}</AlertDialogTitle><AlertDialogDescription>{t('unsavedDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { setCreateDirty(false); setCreateOpen(false); setConfirmCreateClose(false); }}>{t('discard')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={pendingId !== null} onOpenChange={open => { if (!open) setPendingId(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('unsaved')}</AlertDialogTitle><AlertDialogDescription>{t('unsavedDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { setDirty(false); setSelectedId(pendingId!); setPendingId(null); }}>{t('discard')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </FieldGroup>;
}

function ObjectAttributes({ user, canReadContents = false, showDeleted = false, readOnly = false, definition, workspace, onDirtyChange, onBusyChange }: GuardProps & { user: AuthUser; canReadContents?: boolean; showDeleted?: boolean; readOnly?: boolean; definition: ObjectDefinition; workspace: Workspace }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [baseline, setBaseline] = useState(definition.labels);
  const [labels, setLabels] = useState(definition.labels);
  const [saved, setSaved] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [fieldDirty, setFieldDirty] = useState(false);
  const [newFieldOpen, setNewFieldOpen] = useState(false);
  const [newFieldDirty, setNewFieldDirty] = useState(false);
  const [newFieldBusy, setNewFieldBusy] = useState(false);
  const [confirmNewFieldClose, setConfirmNewFieldClose] = useState(false);
  function closeNewField() { if (newFieldBusy) return; if (newFieldDirty) setConfirmNewFieldClose(true); else setNewFieldOpen(false); }
  const [fieldBusy, setFieldBusy] = useState(false);
  const [confirmFieldClose, setConfirmFieldClose] = useState(false);
  const [lifeBusy, setLifeBusy] = useState(false);
  const locked = readOnly || definition.state === 'inactive' || definition.state === 'deleted';
  const displayFields = [...definition.fields, ...(showDeleted ? definition.historicalFields ?? [] : [])];
  const pagination = useClientPagination(displayFields);
  const selectedField = displayFields.find(field => field.id === selectedFieldId);
  function closeField() { if (fieldBusy) return; if (fieldDirty) setConfirmFieldClose(true); else setSelectedFieldId(null); }
  const missingStandard = (['type_status', 'category', 'keyword'] as const).filter(kind => !definition.fields.some(field => field.technicalName === (kind === 'type_status' ? 'type' : kind)));
  const standardMutation = useMutation({ mutationFn: (field: 'type_status' | 'category' | 'keyword') => api('add_standard_field', { objectTypeId: definition.id, field }), onSuccess: async () => {
    await Promise.all([client.invalidateQueries({ queryKey: ['definition', definition.id] }), client.invalidateQueries({ queryKey: ['records', definition.id] }), client.invalidateQueries({ queryKey: ['record', definition.id], refetchType: 'all' })]);
  } });
  const dirty = !sameLabels(labels, baseline);
  const mutation = useMutation({ mutationFn: async () => {
    return api('set_labels', { kind: 'object_type', id: definition.id, labels: cleanLabels(labels) });
  }, onSuccess: async result => {
    setBaseline(result.labels); setLabels(result.labels); setSaved(true);
    await client.invalidateQueries({ queryKey: ['types', workspace.id] });
    await client.invalidateQueries({ queryKey: ['definition', definition.id] });
  } });
  useEffect(() => { onDirtyChange(dirty || fieldDirty || newFieldDirty); }, [dirty, fieldDirty, newFieldDirty, onDirtyChange]);
  useEffect(() => { onBusyChange(mutation.isPending || standardMutation.isPending || fieldBusy || newFieldBusy || lifeBusy); }, [mutation.isPending, standardMutation.isPending, fieldBusy, newFieldBusy, lifeBusy, onBusyChange]);
  const kindLabel = (kind: string) => t(fieldKindKey(kind));
  return <>
    <form id="object-settings-form" data-shortcut-submit aria-label={t('objectAttributes')} onSubmit={event => { event.preventDefault(); if (!locked && dirty && hasLabel(labels) && !mutation.isPending) mutation.mutate(); }}><FieldGroup>
      {mutation.isError ? <ErrorNotice error={mutation.error} /> : null}
      {saved && !dirty ? <Alert><AlertDescription role="status">{t('saved')}</AlertDescription></Alert> : null}
      <FieldSet><FieldLegend>{t('objectAttributes')}</FieldLegend>
        <TranslatedLabelInput readOnly={locked} readOnlyHelp={t(definition.state === 'inactive' ? 'inactiveObjectHelp' : 'readOnlyLabelHelp')} id="object-label" value={labels} disabled={mutation.isPending || lifeBusy || standardMutation.isPending} onChange={next => { setLabels(next); setSaved(false); }} />
        <div className="grid gap-4 sm:grid-cols-2">{[
          ['object-technical', t('technicalName'), definition.technicalName], ['object-table', t('databaseTable'), `${workspace.code}_${definition.technicalName}`],
        ].map(([id, label, value]) => <Field key={id}><FieldLabel htmlFor={id}>{label}</FieldLabel><Input id={id} value={value} readOnly /></Field>)}</div>
      </FieldSet>
      {!locked ? <Field orientation="horizontal" className="flex-wrap justify-end"><Button type="button" variant="outline" disabled={!dirty || mutation.isPending} onClick={() => { setLabels(baseline); setSaved(false); mutation.reset(); }}>{t('resetPreferences')}</Button><Button type="submit" aria-keyshortcuts={keyboardCommands.save.aria} disabled={!dirty || !hasLabel(labels) || mutation.isPending}>{mutation.isPending ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}{mutation.isPending ? t('saving') : t('save')}<Kbd>{saveShortcutLabel}</Kbd></Button></Field> : null}
    </FieldGroup></form>
    <FieldSeparator />
    {!readOnly ? <DefinitionLifecycle label={definition.label} kind="object_type" id={definition.id} objectTypeId={definition.id} state={definition.state} isProtected={definition.isProtected} canDelete={definition.canDelete} disabled={dirty || fieldDirty || newFieldDirty || mutation.isPending} onBusyChange={value => { setLifeBusy(value); onBusyChange(value); }} /> : <FieldDescription>{t('definitionState')}: {t(`definition_${definition.state ?? 'active'}`)}</FieldDescription>}
    <Field orientation="horizontal" className="flex-wrap"><DefinitionJournal user={user} objectTypeId={definition.id} objectLabel={definition.label} fieldLabels={Object.fromEntries([...definition.fields, ...(definition.historicalFields ?? [])].map(field => [field.id, field.label]))} />{definition.state === 'inactive' && canReadContents ? <Button variant="outline" render={<Link to={`/w/${workspace.code}/objects/${definition.technicalName}`} />} nativeButton={false}>{t('viewArchivedRecords')}</Button> : null}</Field>
    {standardMutation.isError ? <ErrorNotice error={standardMutation.error} /> : null}
    <FieldSet><FieldLegend>{t('objectFields')}</FieldLegend>{!locked ? <div className="flex justify-end">{missingStandard.length ? <DropdownMenu><DropdownMenuTrigger render={<Button type="button" variant="outline" data-settings-add-field disabled={mutation.isPending || standardMutation.isPending} />}><PlusIcon data-icon="inline-start" />{t('newField')}<ChevronDownIcon data-icon="inline-end" /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup>{missingStandard.map(kind => <DropdownMenuItem key={kind} onClick={() => standardMutation.mutate(kind)}>{t(kind === 'type_status' ? 'typesAndStatuses' : kind === 'category' ? 'classificationCategory' : 'keyword')}</DropdownMenuItem>)}</DropdownMenuGroup><DropdownMenuSeparator /><DropdownMenuGroup><DropdownMenuItem onClick={() => setNewFieldOpen(true)}>{t('customField')}</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu> : <Button type="button" variant="outline" data-settings-add-field disabled={mutation.isPending || standardMutation.isPending} onClick={() => setNewFieldOpen(true)}><PlusIcon data-icon="inline-start" />{t('newField')}</Button>}</div> : null}<div className="min-w-0 overflow-hidden rounded-lg border"><Table aria-label={t('objectFields')}><TableHeader><TableRow><TableHead>{t('objectName')}</TableHead><TableHead>{t('technicalName')}</TableHead><TableHead>{t('fieldType')}</TableHead><TableHead>{t('requiredField')}</TableHead><TableHead>{t('definitionState')}</TableHead></TableRow></TableHeader><TableBody>
      {pagination.rows.map(field => <TableRow key={field.id} onClick={event => {
        if (mutation.isPending || lifeBusy || standardMutation.isPending || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || window.getSelection()?.toString()) return;
        if (event.target instanceof Element && event.target.closest('button, a, input, select, textarea, [role="button"], [contenteditable]')) return;
        setSelectedFieldId(field.id);
      }}><TableCell><Button type="button" data-field-editor={field.id} variant="link" className="justify-start px-0 hover:no-underline" disabled={mutation.isPending || lifeBusy || standardMutation.isPending} onClick={() => setSelectedFieldId(field.id)}>{field.label}</Button></TableCell><TableCell>{field.technicalName}</TableCell><TableCell>{kindLabel(field.kind)}</TableCell><TableCell>{t(field.required ? 'yes' : 'no')}</TableCell><TableCell>{t(`definition_${field.state ?? 'active'}`)}</TableCell></TableRow>)}
    </TableBody></Table></div><ClientTablePagination pagination={pagination} disabled={mutation.isPending || lifeBusy || standardMutation.isPending} /></FieldSet>
    {newFieldOpen ? <DefinitionDialog kind="field" objectTypeId={definition.id} onClose={closeNewField} onDirtyChange={setNewFieldDirty} onBusyChange={setNewFieldBusy} finalFocus={() => document.querySelector<HTMLElement>('[data-settings-add-field]') ?? true} onCreated={() => { setNewFieldOpen(false); setNewFieldDirty(false); setNewFieldBusy(false); void client.invalidateQueries({ queryKey: ['definition', definition.id] }); }} /> : null}
    <AlertDialog open={confirmNewFieldClose} onOpenChange={setConfirmNewFieldClose}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('unsaved')}</AlertDialogTitle><AlertDialogDescription>{t('unsavedDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { setNewFieldDirty(false); setNewFieldOpen(false); setConfirmNewFieldClose(false); }}>{t('discard')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    {selectedField ? <FieldAttributesDialog readOnly={locked || selectedField.state === 'deleted'} onDeleted={() => { setSelectedFieldId(null); setFieldDirty(false); setFieldBusy(false); }} key={selectedField.id} field={selectedField} definition={definition} onClose={closeField} onDirtyChange={setFieldDirty} onBusyChange={setFieldBusy} /> : null}
    <AlertDialog open={confirmFieldClose} onOpenChange={setConfirmFieldClose}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('unsaved')}</AlertDialogTitle><AlertDialogDescription>{t('unsavedDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { setFieldDirty(false); setSelectedFieldId(null); setConfirmFieldClose(false); }}>{t('discard')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
