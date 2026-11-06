import {notifySuccess} from '@/lib/notifications';
import {PrimaryRequirementsSettings} from './primary-requirements-settings';
import {NumberingSettings} from './numbering-settings';
import {defaultNumbering,numberingSchema} from '@xobject/contracts';
import {ObjectSensitivity} from './content-permissions';
import {createPortal} from 'react-dom';
import {SettingsSection} from './settings-section';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { SettingsTable, SettingsTableSearch, useSettingsTable } from './settings-table';
import { ClientTablePagination } from './client-table-pagination';
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
import { Badge } from '@/components/ui/badge';
import { FieldAttributesDialog, StandardFieldDialog } from './field-attributes-dialog';
import { TranslatedLabelInput, cleanLabels, hasLabel, sameLabels } from './translated-label-input';
import { DefinitionLifecycle, DefinitionJournal } from './definition-lifecycle';
import { Checkbox } from '@/components/ui/checkbox';
import { Link } from 'react-router';
import { Kbd } from '@/components/ui/kbd';
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldSet, FieldLegend } from '@/components/ui/field';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { ErrorNotice, Loading } from './feedback';

type GuardProps = { actionTarget?: HTMLElement | null; onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void };

export function ObjectSettings({ readOnly = false, workspace, user, onDirtyChange, onBusyChange, actionTarget }: GuardProps & { readOnly?: boolean; workspace: Workspace; user: AuthUser }) {
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
  if (types.isPending) return <Loading variant="object"/>;
  if (types.isError) return <ErrorNotice error={types.error} retry={() => { void types.refetch(); }} />;
  return <FieldGroup>
    <SettingsSection><div className="flex flex-wrap items-end gap-3">
    {!sorted.length ? <FieldDescription>{t('noObjects')}</FieldDescription> : <Field className="min-w-48 flex-1" data-disabled={busy || undefined}><FieldLabel htmlFor="settings-object">{t('selectObjectType')}</FieldLabel><Select items={sorted.map(type => ({ value: type.id, label: type.state && type.state !== 'active' ? `${type.label} (${t(`definition_${type.state}`)})` : type.label }))} value={id} disabled={busy} onValueChange={value => { if (!value || value === id) return; if (dirty) setPendingId(value); else setSelectedId(value); }}>
      <SelectTrigger id="settings-object" className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent><SelectGroup>{sorted.map(type => <SelectItem key={type.id} value={type.id}>{type.label}{type.state && type.state !== 'active' ? ` (${t(`definition_${type.state}`)})` : ''}</SelectItem>)}</SelectGroup></SelectContent>
    </Select></Field>}
    {!readOnly ? <Button type="button" variant="outline" data-settings-add-object disabled={busy || createBusy} onClick={() => setCreateOpen(true)}><PlusIcon data-icon="inline-start" />{t('newObject')}</Button> : null}
    </div>
    <Field data-disabled={(busy || dirty) || undefined} orientation="horizontal"><Checkbox id="show-deleted-definitions" checked={showDeleted} disabled={busy || dirty} onCheckedChange={checked => setShowDeleted(checked === true)} /><FieldLabel htmlFor="show-deleted-definitions">{t('showDeletedDefinitions')}</FieldLabel></Field></SettingsSection>
    {id ? <>{definition.isPending ? <Loading variant="object"/> : definition.isError ? <ErrorNotice error={definition.error} retry={() => { void definition.refetch(); }} /> : <ObjectAttributes actionTarget={actionTarget} user={user} canReadContents={definition.data.permissions?.read===true} showDeleted={showDeleted} readOnly={readOnly} key={definition.data.id} definition={definition.data} workspace={workspace} onDirtyChange={setDirty} onBusyChange={setBusy} />}
    </> : null}
    {createOpen ? <DefinitionDialog kind="object" workspaceId={workspace.id} onClose={closeCreate} onDirtyChange={setCreateDirty} onBusyChange={setCreateBusy} finalFocus={() => document.querySelector<HTMLElement>('[data-settings-add-object]') ?? true} onCreated={async id => { await client.invalidateQueries({ queryKey: ['types', workspace.id] }); setCreateOpen(false); setCreateDirty(false); setCreateBusy(false); if (dirty) setPendingId(id); else setSelectedId(id); }} /> : null}
    <AlertDialog open={confirmCreateClose} onOpenChange={setConfirmCreateClose}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('unsaved')}</AlertDialogTitle><AlertDialogDescription>{t('unsavedDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { setCreateDirty(false); setCreateOpen(false); setConfirmCreateClose(false); }}>{t('discard')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={pendingId !== null} onOpenChange={open => { if (!open) setPendingId(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('unsaved')}</AlertDialogTitle><AlertDialogDescription>{t('unsavedDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { setDirty(false); setSelectedId(pendingId!); setPendingId(null); }}>{t('discard')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </FieldGroup>;
}

function ObjectAttributes({ user, canReadContents = false, showDeleted = false, readOnly = false, definition, workspace, onDirtyChange, onBusyChange, actionTarget }: GuardProps & { user: AuthUser; canReadContents?: boolean; showDeleted?: boolean; readOnly?: boolean; definition: ObjectDefinition; workspace: Workspace }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [primaryRequirements,setPrimaryRequirements]=useState(definition.primaryRequirements);
  const [primaryBaseline,setPrimaryBaseline]=useState(definition.primaryRequirements);
  const [sensitive,setSensitive]=useState(Boolean(definition.sensitive));
  const [numbering,setNumbering]=useState(definition.numbering??defaultNumbering());
  const [numberingBaseline,setNumberingBaseline]=useState(definition.numbering??defaultNumbering());
  const numberingValid=numberingSchema.safeParse(numbering).success;
  const [securityBaseline,setSecurityBaseline]=useState({sensitive:Boolean(definition.sensitive),version:definition.permissionsVersion??1});
  const securityDirty=sensitive!==securityBaseline.sensitive;
  const [baseline, setBaseline] = useState(definition.labels);
  const [baselineVersion, setBaselineVersion] = useState(definition.version);
  const [labels, setLabels] = useState(definition.labels);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [fieldDirty, setFieldDirty] = useState(false);
  const [newFieldOpen, setNewFieldOpen] = useState(false);
  const [newStandardOpen, setNewStandardOpen] = useState<'type_status' | 'category' | 'keyword' | null>(null);
  const [newFieldDirty, setNewFieldDirty] = useState(false);
  const [newFieldBusy, setNewFieldBusy] = useState(false);
  const [confirmNewFieldClose, setConfirmNewFieldClose] = useState(false);
  function closeNewField() { if (newFieldBusy) return; if (newFieldDirty) setConfirmNewFieldClose(true); else { setNewFieldOpen(false); setNewStandardOpen(null); } }
  const [fieldBusy, setFieldBusy] = useState(false);
  const [confirmFieldClose, setConfirmFieldClose] = useState(false);
  const [lifeBusy, setLifeBusy] = useState(false);
  const locked = readOnly || definition.state === 'inactive' || definition.state === 'deleted';
  const fieldCollator = new Intl.Collator(user.language ?? workspace.default_language, { sensitivity: 'base' });
  const displayFields = [...definition.fields, ...(showDeleted ? definition.historicalFields ?? [] : [])]
    .sort((a, b) => fieldCollator.compare(a.label, b.label) || a.technicalName.localeCompare(b.technicalName) || a.id.localeCompare(b.id));
  const { search, onSearch, pagination } = useSettingsTable(displayFields, field => `${field.label} ${field.technicalName} ${t(fieldKindKey(field.kind))} ${t(field.required ? 'yes' : 'no')} ${t(`definition_${field.state ?? 'active'}`)}`);
  const ambiguousLabels = new Set(displayFields.filter((field, index) => displayFields.findIndex(other => other.label.toLocaleLowerCase() === field.label.toLocaleLowerCase()) !== index).map(field => field.label.toLocaleLowerCase()));
  const selectedField = displayFields.find(field => field.id === selectedFieldId);
  function closeField() { if (fieldBusy) return; if (fieldDirty) setConfirmFieldClose(true); else setSelectedFieldId(null); }
  const missingStandard = (['type_status', 'category', 'keyword'] as const).filter(kind => !definition.fields.some(field => field.technicalName === (kind === 'type_status' ? 'type' : kind)));
  const labelsDirty = !sameLabels(labels, baseline);
  const dirty = JSON.stringify(primaryRequirements)!==JSON.stringify(primaryBaseline)||labelsDirty||securityDirty||JSON.stringify(numbering)!==JSON.stringify(numberingBaseline);
  const mutation = useMutation({ mutationFn: async () => {
    return api('configure_object_settings', {objectTypeId:definition.id,version:baselineVersion,labels:cleanLabels(labels),numbering,primaryRequirements,...(securityDirty?{security:{version:securityBaseline.version,sensitive,confirmWidening:securityBaseline.sensitive&&!sensitive}}:{})});
  }, onError: async () => { await client.invalidateQueries({ queryKey: ['definition', definition.id] }); }, onSuccess: async result => {
    setPrimaryRequirements(result.primaryRequirements);setPrimaryBaseline(result.primaryRequirements);setNumbering(result.numbering??defaultNumbering());setNumberingBaseline(result.numbering??defaultNumbering());setBaselineVersion(result.version); setBaseline(result.labels); setLabels(result.labels); setSensitive(Boolean(result.sensitive));setSecurityBaseline({sensitive:Boolean(result.sensitive),version:result.permissionsVersion??1});notifySuccess(t('saved'));
    await client.invalidateQueries({ queryKey: ['types', workspace.id] });
    await client.invalidateQueries({ queryKey: ['definition', definition.id] });
  } });
  useEffect(() => { onDirtyChange(securityDirty||dirty || fieldDirty || newFieldDirty); }, [securityDirty,dirty, fieldDirty, newFieldDirty, onDirtyChange]);
  useEffect(() => { onBusyChange(mutation.isPending || fieldBusy || newFieldBusy || lifeBusy); }, [mutation.isPending, fieldBusy, newFieldBusy, lifeBusy, onBusyChange]);
  useEffect(()=>{if(!dirty){setPrimaryRequirements(definition.primaryRequirements);setPrimaryBaseline(definition.primaryRequirements);setNumbering(definition.numbering??defaultNumbering());setNumberingBaseline(definition.numbering??defaultNumbering());setBaselineVersion(definition.version);setBaseline(definition.labels);setLabels(definition.labels);setSensitive(Boolean(definition.sensitive));setSecurityBaseline({sensitive:Boolean(definition.sensitive),version:definition.permissionsVersion??1});}},[definition.version,definition.labels,definition.sensitive,definition.permissionsVersion,dirty]);
  const kindLabel = (kind: string) => t(fieldKindKey(kind));
  return <>
    <form id={`object-settings-${definition.id}`} data-shortcut-submit aria-label={t('objectAttributes')} onSubmit={event => { event.preventDefault(); if ((!locked||user.isAdmin&&definition.state!=='deleted') && dirty && numberingValid && hasLabel(labels) && !mutation.isPending) mutation.mutate(); }}><FieldGroup><SettingsSection><FieldSet className="min-w-0"><FieldLegend>{t('objectProperties')}</FieldLegend><FieldDescription>{t('objectPropertiesHelp')}</FieldDescription>
      {mutation.isError ? <ErrorNotice error={mutation.error} /> : null}
      <FieldGroup>
        <TranslatedLabelInput compactHelp readOnly={locked} readOnlyHelp={t(definition.state === 'inactive' ? 'inactiveObjectHelp' : 'readOnlyLabelHelp')} id="object-label" value={labels} disabled={mutation.isPending || lifeBusy} onChange={next => { setLabels(next);  }} />

      </FieldGroup>
      {(!locked||user.isAdmin&&definition.state!=='deleted') && actionTarget ? createPortal(<><Button type="button" variant="outline" disabled={!dirty || mutation.isPending || lifeBusy} onClick={() => { setPrimaryRequirements(definition.primaryRequirements);setPrimaryBaseline(definition.primaryRequirements);setNumbering(definition.numbering??defaultNumbering());setNumberingBaseline(definition.numbering??defaultNumbering());setBaselineVersion(definition.version); setBaseline(definition.labels); setLabels(definition.labels);setSensitive(Boolean(definition.sensitive));setSecurityBaseline({sensitive:Boolean(definition.sensitive),version:definition.permissionsVersion??1});  mutation.reset(); }}>{t('resetPreferences')}</Button><Button type="submit" form={`object-settings-${definition.id}`} aria-keyshortcuts={keyboardCommands.save.aria} disabled={!dirty || !numberingValid || !hasLabel(labels) || mutation.isPending || lifeBusy}>{mutation.isPending ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}{mutation.isPending ? t('saving') : t('save')}<Kbd>{saveShortcutLabel}</Kbd></Button></>, actionTarget) : null}
    </FieldSet></SettingsSection>
    <PrimaryRequirementsSettings definition={definition} value={primaryRequirements} onChange={next=>{setPrimaryRequirements(next);}} disabled={mutation.isPending||lifeBusy} readOnly={locked}/><NumberingSettings value={numbering} onChange={next=>{setNumbering(next);}} readOnly={locked} disabled={mutation.isPending||lifeBusy} timeZone={workspace.time_zone}/><ObjectSensitivity definition={definition} isAdmin={Boolean(user.isAdmin)} value={sensitive} disabled={mutation.isPending||lifeBusy} onChange={next=>{setSensitive(next);}}/></FieldGroup></form>
    <SettingsSection><FieldSet className="min-w-0"><FieldLegend className="flex w-full items-center justify-between gap-3"><span>{t('objectFields')}</span>{!locked ? <>{missingStandard.length ? <DropdownMenu><DropdownMenuTrigger render={<Button type="button" variant="outline" data-settings-add-field disabled={mutation.isPending} />}><PlusIcon data-icon="inline-start" />{t('newField')}<ChevronDownIcon data-icon="inline-end" /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup>{missingStandard.map(kind => <DropdownMenuItem key={kind} onClick={() => setNewStandardOpen(kind)}>{t(kind === 'type_status' ? 'typesAndStatuses' : kind === 'category' ? 'classificationCategory' : 'keyword')}</DropdownMenuItem>)}</DropdownMenuGroup><DropdownMenuSeparator /><DropdownMenuGroup><DropdownMenuItem onClick={() => setNewFieldOpen(true)}>{t('customField')}</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu> : <Button type="button" variant="outline" data-settings-add-field disabled={mutation.isPending} onClick={() => setNewFieldOpen(true)}><PlusIcon data-icon="inline-start" />{t('newField')}</Button>}</> : null}</FieldLegend><SettingsTableSearch value={search} onChange={onSearch} /><SettingsTable aria-label={t('objectFields')}><TableHeader><TableRow><TableHead className="w-[45%] sm:w-[25%]">{t('objectName')}</TableHead><TableHead className="hidden sm:table-cell sm:w-[25%]">{t('technicalName')}</TableHead><TableHead className="w-[30%] sm:w-[20%]">{t('fieldType')}</TableHead><TableHead className="w-[25%] sm:w-[15%]">{t('requiredField')}</TableHead><TableHead className="hidden sm:table-cell sm:w-[15%]">{t('definitionState')}</TableHead></TableRow></TableHeader><TableBody>
      {!pagination.total ? <TableRow><TableCell colSpan={5}>{t(search.trim() ? 'settingsNoMatches' : 'noFieldsYet')}</TableCell></TableRow> : null}{pagination.rows.map(field => <TableRow key={field.id} onClick={event => {
        if (mutation.isPending || lifeBusy || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || window.getSelection()?.toString()) return;
        if (event.target instanceof Element && event.target.closest('button, a, input, select, textarea, [role="button"], [contenteditable]')) return;
        setSelectedFieldId(field.id);
      }}><TableCell><Button type="button" data-field-editor={field.id} variant="link" className="h-auto w-full justify-start whitespace-normal px-0 text-left [overflow-wrap:anywhere]" disabled={mutation.isPending || lifeBusy} onClick={() => setSelectedFieldId(field.id)}>{field.label}</Button>{ambiguousLabels.has(field.label.toLocaleLowerCase()) ? <div className="text-xs text-muted-foreground sm:hidden wrap-anywhere">{field.technicalName}</div> : null}{field.state && field.state !== 'active' ? <Badge variant="outline" className="mt-1 sm:hidden">{t(`definition_${field.state}`)}</Badge> : null}</TableCell><TableCell className="hidden sm:table-cell"><span className="block truncate" title={field.technicalName}>{field.technicalName}</span></TableCell><TableCell>{kindLabel(field.kind)}</TableCell><TableCell>{t(field.required ? 'yes' : 'no')}</TableCell><TableCell className="hidden sm:table-cell">{t(`definition_${field.state ?? 'active'}`)}</TableCell></TableRow>)}
    </TableBody></SettingsTable><ClientTablePagination pagination={pagination} countLabel={t('fieldCount', { count: pagination.total })} disabled={mutation.isPending || lifeBusy} /></FieldSet></SettingsSection>
    <SettingsSection><FieldSet className="min-w-0"><FieldLegend>{t('objectManagement')}</FieldLegend>
      {!readOnly ? <DefinitionLifecycle label={definition.label} kind="object_type" id={definition.id} objectTypeId={definition.id} state={definition.state} isProtected={definition.isProtected} canDelete={definition.canDelete} disabled={dirty || fieldDirty || newFieldDirty || mutation.isPending} onBusyChange={value => { setLifeBusy(value); onBusyChange(value); }} /> : <Badge variant="outline">{t(`definition_${definition.state ?? 'active'}`)}</Badge>}
      <Field orientation="horizontal" className="flex-wrap"><DefinitionJournal user={user} objectTypeId={definition.id} objectLabel={definition.label} fieldLabels={Object.fromEntries([...definition.fields, ...(definition.historicalFields ?? [])].map(field => [field.id, field.label]))} />{definition.state === 'inactive' && canReadContents ? <Button variant="outline" render={<Link to={`/w/${workspace.code}/objects/${definition.technicalName}`} />} nativeButton={false}>{t('viewArchivedRecords')}</Button> : null}</Field>
    </FieldSet></SettingsSection>
    <Collapsible className="min-w-0 overflow-hidden rounded-lg border">
      <CollapsibleTrigger className="group/object-technical" render={<Button type="button" variant="ghost" className="w-full justify-between rounded-none" />}>
        {t('objectTechnicalDetails')}<ChevronDownIcon data-icon="inline-end" className="transition-transform group-aria-expanded/object-technical:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent><dl className="grid min-w-0 gap-4 border-t p-4 sm:grid-cols-2">{[
        [t('technicalName'), definition.technicalName], [t('databaseTable'), `${workspace.code}_${definition.technicalName}`],
      ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-mono text-sm wrap-anywhere">{value}</dd></div>)}</dl></CollapsibleContent>
    </Collapsible>
    {newStandardOpen ? <StandardFieldDialog standardKind={newStandardOpen} definition={definition} onClose={closeNewField} onDirtyChange={setNewFieldDirty} onBusyChange={setNewFieldBusy} finalFocus={() => document.querySelector<HTMLElement>('[data-settings-add-field]') ?? true} onCreated={() => { setNewStandardOpen(null); setNewFieldDirty(false); setNewFieldBusy(false); }} /> : null}
    {newFieldOpen ? <DefinitionDialog kind="field" objectTypeId={definition.id} onClose={closeNewField} onDirtyChange={setNewFieldDirty} onBusyChange={setNewFieldBusy} finalFocus={() => document.querySelector<HTMLElement>('[data-settings-add-field]') ?? true} onCreated={() => { setNewFieldOpen(false); setNewFieldDirty(false); setNewFieldBusy(false); void client.invalidateQueries({ queryKey: ['definition', definition.id] }); }} /> : null}
    <AlertDialog open={confirmNewFieldClose} onOpenChange={setConfirmNewFieldClose}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('unsaved')}</AlertDialogTitle><AlertDialogDescription>{t('unsavedDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { setNewFieldDirty(false); setNewFieldOpen(false); setNewStandardOpen(null); setConfirmNewFieldClose(false); }}>{t('discard')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    {selectedField ? <FieldAttributesDialog readOnly={locked || selectedField.state === 'deleted'||['access_principals','record_number'].includes(selectedField.technicalName)} onDeleted={() => { setSelectedFieldId(null); setFieldDirty(false); setFieldBusy(false); }} key={selectedField.id} field={selectedField} definition={definition} onClose={closeField} onDirtyChange={setFieldDirty} onBusyChange={setFieldBusy} /> : null}
    <AlertDialog open={confirmFieldClose} onOpenChange={setConfirmFieldClose}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('unsaved')}</AlertDialogTitle><AlertDialogDescription>{t('unsavedDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { setFieldDirty(false); setSelectedFieldId(null); setConfirmFieldClose(false); }}>{t('discard')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}
