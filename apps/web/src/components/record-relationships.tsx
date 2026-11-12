import {CombinedRelationshipList} from './combined-relationship-list';
import {contactPersonValues} from '@/lib/contact-person-summary';
import {TruncatedText} from './truncated-text';
import {RecordIcon} from './record-icon';
import {RelationshipAttributes} from './relationship-attributes';
import {Collapsible,CollapsibleTrigger,CollapsibleContent} from '@/components/ui/collapsible';
import {PrimaryAssociationFields} from './primary-association-fields';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Link2Icon, PlusIcon, PencilIcon, XIcon, ArrowUpRightIcon, ChevronDownIcon } from 'lucide-react';
import {fieldApplies,type FormEntry,type FieldDefinition,type FieldValue,type RelationshipField,type RelatedRecord } from '@xobject/contracts';
import { relationshipShowsObjectColumn, relatedIdentity } from '@/lib/relationship-selection';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, FieldDescription, FieldLabel, FieldError } from '@/components/ui/field';
import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton } from '@/components/ui/input-group';


import { RelationshipPicker } from './relationship-picker';
export { RecordDossier } from './record-dossier';

type Props = { primaryRequirements:import('@xobject/contracts').PrimaryRequirements;workspaceId:string;singleGroupLabel?:string;entry:FormEntry; objectTypeId: string; recordId?: string; fields: RelationshipField[]; fieldDefinitions:FieldDefinition[]; values:Record<string,FieldValue>; primaryChain?:import('@xobject/contracts').PrimaryChain|null; disabled: boolean; readOnly?: boolean; onChange: (fields: RelationshipField[]) => void; onPickerDirtyChange: (dirty: boolean) => void; workspaceCode: string };

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
  return <RelationshipControl {...props} fieldDefinitions={fieldDefinitions} values={values} sourceValues={sourceValues} professionalColumns={'professionalColumns'in entry?entry.professionalColumns:undefined} objectColumn={'objectColumn'in entry?entry.objectColumn:undefined} field={field} expandedDefault={'expanded' in entry?entry.expanded:undefined} onChange={change}/>;
}


function RelationshipControl({ professionalColumns,fieldDefinitions,values,workspaceId,objectColumn,sourceValues,objectTypeId, recordId, field, disabled, readOnly, onChange, onPickerDirtyChange, workspaceCode, expandedDefault }: Omit<Props, 'fields' | 'onChange' | 'entry'> & { professionalColumns?:boolean;objectColumn?:import('@xobject/contracts').RelationshipObjectColumn;expandedDefault?:'auto'|'open'|'closed';sourceValues?:Record<string,FieldValue>;field: RelationshipField; onChange: (targets: RelatedRecord[]) => void }) {
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
  const listTargets = field.targets.every(target=>target.objectTechnicalName==='contacts') ? [...field.targets].sort((a,b)=>a.keyword.localeCompare(b.keyword,i18n.language)||relatedIdentity(a).localeCompare(relatedIdentity(b))) : field.targets;

  const showObject=relationshipShowsObjectColumn([field],objectTypeId,objectColumn);
  const professional=field.targets.some(target=>target.contactPerson);
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
        {target?<InputGroupAddon><RecordIcon iconKey={target.iconKey} objectLabel={label(target.objectLabels)}/></InputGroupAddon>:null}<InputGroupInput id={id} readOnly disabled={disabled} value={target?.keyword ?? ''} title={target?.keyword} placeholder={t('noSelection')} aria-required={required || undefined} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined}/>
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

        {editable ? <Button id={`${id}-choose`} type="button" variant="outline" size="icon-sm" disabled={disabled} aria-label={chooseLabel} onClick={()=>setPickerOpen(true)}><PlusIcon/></Button>:null}
      </div>
      <CollapsibleContent className="flex flex-col gap-3 pt-3">
        <CombinedRelationshipList professionalColumns={professionalColumns} showAdd={false} single chooseId={`${id}-choose`} objectColumn={objectColumn} title={title} entries={[{relationshipTypeId:field.definition.id,side:field.side,width:'full'}]} fields={[field]} fieldDefinitions={fieldDefinitions} values={values} workspaceId={workspaceId} objectTypeId={objectTypeId} recordId={recordId} workspaceCode={workspaceCode} disabled={disabled} readOnly={!editable} onChange={next=>onChange(next[0].targets)} onPickerDirtyChange={onPickerDirtyChange}/>
      </CollapsibleContent></Collapsible>}
    <RelationshipAttributes field={field} targets={field.targets} workspaceId={workspaceId} disabled={disabled} readOnly={readOnly} onChange={onChange}/>
    {!field.definition.active ? <FieldDescription>{t('relationshipInactiveHelp')}</FieldDescription> : null}
    {invalid ? <FieldError id={`${id}-error`}>{t('relationshipRequiredHelp')}</FieldError> : null}
    {pickerOpen ? <RelationshipPicker professionalColumns={professionalColumns} objectColumn={objectColumn} sourceValues={sourceValues} objectTypeId={objectTypeId} recordId={recordId} field={field} title={title} onDirtyChange={onPickerDirtyChange} onClose={close} onApply={targets => { close(); setExpanded(true); onChange(targets); }} finalFocus={() => document.getElementById(`${id}-choose`) ?? true} /> : null}
  </Field>;
}
