import {RelationshipAttributes} from './relationship-attributes';
import {Collapsible,CollapsibleTrigger,CollapsibleContent} from '@/components/ui/collapsible';
import {PrimaryAssociationFields} from './primary-association-fields';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Link2Icon, PlusIcon, PencilIcon, XIcon, ArrowUpRightIcon, ChevronDownIcon } from 'lucide-react';
import {fieldApplies,type FormEntry,type FieldDefinition,type FieldValue,type RelationshipField,type RelatedRecord } from '@xobject/contracts';
import { relatedIdentity } from '@/lib/relationship-selection';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, FieldDescription, FieldLabel, FieldError } from '@/components/ui/field';
import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton } from '@/components/ui/input-group';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { useClientPagination, ClientTablePagination } from './client-table-pagination';
import { RelationshipPicker } from './relationship-picker';
export { RecordDossier } from './record-dossier';

type Props = { workspaceId:string;singleGroupLabel?:string;entry:FormEntry; objectTypeId: string; recordId?: string; fields: RelationshipField[]; fieldDefinitions:FieldDefinition[]; values:Record<string,FieldValue>; primaryChain?:import('@xobject/contracts').PrimaryChain|null; disabled: boolean; readOnly?: boolean; onChange: (fields: RelationshipField[]) => void; onPickerDirtyChange: (dirty: boolean) => void; workspaceCode: string };

export function RecordRelationshipFields({ entry,fields,onChange,primaryChain,fieldDefinitions,values,singleGroupLabel,...props }:Props){
  const {t}=useTranslation();
  const field='primary' in entry?fields.find(field=>field.definition.kind==='primary'&&field.side==='right'):'relationshipTypeId' in entry?fields.find(field=>field.definition.id===entry.relationshipTypeId&&field.side===entry.side):undefined;
  if(!field)return null;
  const rule=field.side==='left'?field.definition.leftApplicability:field.definition.rightApplicability;
  if(!fieldApplies({applicability:rule},fieldDefinitions,values))return null;
  const change=(targets:RelatedRecord[])=>onChange(fields.map(old=>old===field?{...old,targets}:old));
  if(field.definition.kind==='primary')return <PrimaryAssociationFields {...props} headingHidden={singleGroupLabel===t('primaryChainTitle')} readOnly={props.readOnly||field.editable===false} configuration={primaryChain??null} field={field} onChange={change}/>;
  const controller=fieldDefinitions.find(item=>item.id===rule?.fieldId);
  const sourceValues=controller?{[controller.technicalName]:values[controller.technicalName]??null}:undefined;
  return <RelationshipControl {...props} sourceValues={sourceValues} field={field} expandedDefault={'expanded' in entry?entry.expanded:undefined} onChange={change}/>;
}


function RelationshipControl({ workspaceId,sourceValues,objectTypeId, recordId, field, disabled, readOnly, onChange, onPickerDirtyChange, workspaceCode, expandedDefault }: Omit<Props, 'fields' | 'onChange' | 'fieldDefinitions' | 'values' | 'entry'> & { expandedDefault?:'auto'|'open'|'closed';sourceValues?:Record<string,FieldValue>;field: RelationshipField; onChange: (targets: RelatedRecord[]) => void }) {
  const { t, i18n } = useTranslation(), [pickerOpen, setPickerOpen] = useState(false);
  const navigate = useNavigate();
  const label = (labels: Record<string, string>) => labels[i18n.language] ?? labels.de ?? labels.en ?? Object.values(labels)[0] ?? '';
  const title = label(field.side === 'left' ? field.definition.leftLabels : field.definition.rightLabels);
  const single = (field.side === 'left' ? field.definition.leftMax : field.definition.rightMax) === 1;
  const required = field.definition.active && (field.side === 'left' ? field.definition.leftMin : field.definition.rightMin) > 0;
  const editable = !readOnly && field.editable!==false && field.definition.active;
  const invalid = required && !field.targets.length&&!field.restricted;
  const [expanded,setExpanded]=useState(expandedDefault==='open'||(expandedDefault!=='closed'&&(field.targets.length>0||required)));
  const id = `relation-${field.definition.id}-${field.side}`;
  const pagination = useClientPagination(field.targets);
  const close = () => { onPickerDirtyChange(false); setPickerOpen(false); };
  const remove = (target: RelatedRecord) => { onChange(field.targets.filter(item => relatedIdentity(item) !== relatedIdentity(target))); requestAnimationFrame(() => document.getElementById(`${id}-choose`)?.focus()); };
  const path = (target: RelatedRecord) => `/w/${workspaceCode}/objects/${target.objectTechnicalName}/${target.recordId}`;
  const chooseLabel = t('relationshipChooseFor', { name: title });
  const fieldLabel = <>{title}{required ? ' *' : ''}{!field.definition.active ? <Badge variant="outline">{t('definition_inactive')}</Badge> : null}</>;
  const controls = (target: RelatedRecord) => <>
    <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={t('relationshipOpenRecord', { name: target.keyword })} title={t('openRecord')} nativeButton={false} render={<Link to={path(target)} />}><ArrowUpRightIcon /></Button>
    {editable ? <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={t('removeRelationship', { name: target.keyword })} title={t('removeRelationship', { name: target.keyword })} onClick={() => remove(target)}><XIcon /></Button> : null}
  </>;
  const target = field.targets[0];
  return <Field className="min-w-0" aria-labelledby={`${id}-title`} data-invalid={invalid || undefined}>
    {field.restricted?<FieldDescription>{t('restrictedRelationshipHelp')}</FieldDescription>:null}
    {single && field.targets.length <= 1 ? <>
      <FieldLabel id={`${id}-title`} htmlFor={id}>{fieldLabel}</FieldLabel>
      <InputGroup>
        <InputGroupInput id={id} readOnly disabled={disabled} value={target?.keyword ?? ''} title={target?.keyword} placeholder={t('noSelection')} aria-required={required || undefined} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined}/>
        <InputGroupAddon align="inline-end" className="shrink-0 gap-0.5 has-[>button]:mr-0">
          {editable ? <InputGroupButton id={`${id}-choose`} size="icon-xs" disabled={disabled} title={t(target ? 'relationshipChange' : 'relationshipChoose')} aria-label={chooseLabel} onClick={() => setPickerOpen(true)}>{target ? <PencilIcon/> : <Link2Icon/>}</InputGroupButton> : null}
          {target ? <InputGroupButton size="icon-xs" disabled={disabled} nativeButton={false} title={t('openRecord')} aria-label={t('relationshipOpenRecord', {name: target.keyword})} render={<Link to={path(target)}/>}><ArrowUpRightIcon/></InputGroupButton> : null}
          {target && editable ? <InputGroupButton size="icon-xs" disabled={disabled} title={t('removeRelationship', {name: target.keyword})} aria-label={t('removeRelationship', {name: target.keyword})} onClick={() => remove(target)}><XIcon/></InputGroupButton> : null}
        </InputGroupAddon>
      </InputGroup>
      {target?.state === 'inactive' ? <FieldDescription>{label(target.objectLabels)} · {t('definition_inactive')}</FieldDescription> : null}
    </> : <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className="flex items-center justify-between gap-3">
        <CollapsibleTrigger render={<Button type="button" variant="ghost" className="group/relation h-auto min-h-8 min-w-0 shrink flex-wrap justify-start whitespace-normal px-0 py-1 text-left"/>}><ChevronDownIcon data-icon="inline-start" className="transition-transform group-aria-expanded/relation:rotate-180"/><span id={`${id}-title`}>{fieldLabel}</span><Badge variant="secondary">{field.targets.length}</Badge>{single?<span className="text-xs text-muted-foreground">{t('relationshipAtMostOne')}</span>:null}</CollapsibleTrigger>
        {editable ? <Button id={`${id}-choose`} type="button" variant="outline" size="icon-sm" disabled={disabled} aria-label={chooseLabel} title={t(single && field.targets.length ? 'relationshipChange' : 'addRelatedRecord')} onClick={() => setPickerOpen(true)}>{single && field.targets.length ? <PencilIcon/> : <PlusIcon/>}</Button> : null}
      </div>
      <CollapsibleContent className="flex flex-col gap-3 pt-3"><div className="min-w-0 overflow-hidden rounded-lg border"><Table aria-labelledby={`${id}-title`} className="table-fixed">
        <TableHeader><TableRow><TableHead>{t('keyword')}</TableHead><TableHead className="w-24 sm:w-40">{t('objectSingular')}</TableHead><TableHead className="w-20"><span className="sr-only">{t('action')}</span></TableHead></TableRow></TableHeader>
        <TableBody>{pagination.rows.map(target => <TableRow key={relatedIdentity(target)} onClick={event => {
          if (disabled || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || window.getSelection()?.toString()) return;
          if (event.target instanceof Element && event.target.closest('a, button, input, label')) return;
          void navigate(path(target));
        }}>
          <TableCell className="truncate"><Button type="button" variant="link" className="h-auto max-w-full justify-start px-0" disabled={disabled} nativeButton={false} render={<Link to={path(target)} />} title={target.keyword}><span className="truncate">{target.keyword}</span></Button></TableCell>
          <TableCell className="truncate" title={label(target.objectLabels)}>{label(target.objectLabels)}{target.state === 'inactive' ? <Badge variant="outline" className="ml-2">{t('definition_inactive')}</Badge> : null}</TableCell>
          <TableCell><div className="flex items-center justify-end">{controls(target)}</div></TableCell>
        </TableRow>)}
        {!field.targets.length ? <TableRow><TableCell colSpan={3} className="h-16 text-center text-muted-foreground">{t('relationshipNoneSelected')}</TableCell></TableRow> : null}</TableBody>
      </Table></div>
      {field.targets.length > 10 ? <ClientTablePagination pagination={pagination} disabled={disabled} countLabel={t('relationshipCount', { count: field.targets.length })} /> : null}
      </CollapsibleContent></Collapsible>}
    <RelationshipAttributes field={field} targets={field.targets} workspaceId={workspaceId} disabled={disabled} readOnly={readOnly} onChange={onChange}/>
    {!field.definition.active ? <FieldDescription>{t('relationshipInactiveHelp')}</FieldDescription> : null}
    {invalid ? <FieldError id={`${id}-error`}>{t('relationshipRequiredHelp')}</FieldError> : null}
    {pickerOpen ? <RelationshipPicker sourceValues={sourceValues} objectTypeId={objectTypeId} recordId={recordId} field={field} title={title} onDirtyChange={onPickerDirtyChange} onClose={close} onApply={targets => { close(); setExpanded(true); onChange(targets); }} finalFocus={() => document.getElementById(`${id}-choose`) ?? true} /> : null}
  </Field>;
}
