import {contactPersonValues} from '@/lib/contact-person-summary';
import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Link,useNavigate} from 'react-router';
import {PlusIcon,SearchIcon,XIcon} from 'lucide-react';
import {fieldApplies,type FormEntry,type FieldDefinition,type FieldValue,type RelationshipField,type RelatedRecord} from '@xobject/contracts';
import {relatedIdentity,relationshipShowsObjectColumn} from '@/lib/relationship-selection';
import {Button} from './ui/button';
import {Field,FieldLabel,FieldDescription,FieldError} from './ui/field';
import {InputGroup,InputGroupAddon,InputGroupInput} from './ui/input-group';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuGroup,DropdownMenuItem} from './ui/dropdown-menu';
import {RecordDataTable,RecordTableToolbar,type RecordColumn} from './record-data-table';
import {RecordIcon} from './record-icon';
import {TruncatedText} from './truncated-text';
import {RelationshipPicker} from './relationship-picker';
import {useSettingsTable} from './settings-table';

type Row={id:string;field:RelationshipField;target:RelatedRecord;relationship:string;object:string;keyword:string};
type Props={showAdd?:boolean;chooseId?:string;single?:boolean;objectColumn?:import('@xobject/contracts').RelationshipObjectColumn;title:string;entries:FormEntry[];fields:RelationshipField[];fieldDefinitions:FieldDefinition[];values:Record<string,FieldValue>;workspaceId:string;objectTypeId:string;recordId?:string;workspaceCode:string;disabled:boolean;readOnly:boolean;lockedRelationshipId?:string;onChange:(fields:RelationshipField[])=>void;onPickerDirtyChange:(dirty:boolean)=>void};
/** Combine presentation only. Each edge keeps its type, direction, permissions and normal writer. */
export function CombinedRelationshipList({showAdd=true,chooseId,single=false,objectColumn,title,entries,fields,fieldDefinitions,values,objectTypeId,recordId,workspaceCode,disabled,readOnly,lockedRelationshipId,onChange,onPickerDirtyChange}:Props){
 const {t,i18n}=useTranslation(),navigate=useNavigate();
 const [picker,setPicker]=useState<RelationshipField|null>(null),[sort,setSort]=useState({by:'keyword',direction:'asc' as 'asc'|'desc'});
 const label=(labels:Record<string,string>)=>labels[i18n.language]??labels.en??labels.de??Object.values(labels)[0]??'';
 const sideLabel=(field:RelationshipField)=>label(field.side==='left'?field.definition.leftLabels:field.definition.rightLabels);
 const visible=entries.flatMap(entry=>{if(!('relationshipTypeId'in entry))return [];const field=fields.find(f=>f.definition.id===entry.relationshipTypeId&&f.side===entry.side);return field&&fieldApplies({applicability:field.side==='left'?field.definition.leftApplicability:field.definition.rightApplicability},fieldDefinitions,values)?[field]:[];});
 const editable=(field:RelationshipField)=>!readOnly&&!disabled&&field.editable!==false&&field.definition.active&&field.definition.id!==lockedRelationshipId;
 const rows:Row[]=visible.flatMap(field=>field.targets.map(target=>({id:`${field.definition.id}:${field.side}:${relatedIdentity(target)}`,field,target,keyword:target.keyword,object:label(target.objectLabels),relationship:sideLabel(field)})));
 rows.sort((a,b)=>{const text=(row:Row)=>sort.by in contactPersonValues(row.target,i18n.language)?contactPersonValues(row.target,i18n.language)[sort.by as 'jobTitle'|'department'|'function']:row[sort.by as 'keyword'|'object'|'relationship']??'';return (text(a).localeCompare(text(b),i18n.language)||a.id.localeCompare(b.id))*(sort.direction==='asc'?1:-1);});
 const table=useSettingsTable(rows,row=>`${row.relationship} ${row.object} ${row.keyword} ${Object.values(contactPersonValues(row.target,i18n.language)).join(' ')}`),path=(target:RelatedRecord)=>`/w/${workspaceCode}/objects/${target.objectTechnicalName}/${target.recordId}`;
 const change=(field:RelationshipField,targets:RelatedRecord[])=>onChange(fields.map(old=>old.definition.id===field.definition.id&&old.side===field.side?{...old,targets}:old));
 const columns:RecordColumn<Row>[]=[
  ...(!single?[{key:'relationship',label:t('relationshipType'),cell:(row:Row)=>row.relationship}]:[]),
  ...(relationshipShowsObjectColumn(visible,objectTypeId,objectColumn)?[{key:'object',label:t('objectSingular'),cell:(row:Row)=>row.object}]:[]),
  {key:'keyword',label:t('keyword'),cell:row=><Link className="inline-flex min-w-0 max-w-80 items-center gap-2" aria-disabled={disabled||undefined} tabIndex={disabled?-1:undefined} onClick={event=>{if(disabled)event.preventDefault();}} to={path(row.target)}><RecordIcon iconKey={row.target.iconKey} objectLabel={row.object}/><TruncatedText>{row.keyword}</TruncatedText></Link>},
  ...(rows.some(row=>row.target.contactPerson)?(['jobTitle','department','function'] as const).map((key,index)=>({key,label:t(['contactPersonJobTitle','contactPersonDepartment','contactPersonFunction'][index]),cell:(row:Row)=>contactPersonValues(row.target,i18n.language)[key]||'—'})):[]),
 ];
 const id=`relationship-list-${objectTypeId}-${entries.map(e=>'relationshipTypeId'in e?e.relationshipTypeId:'').join('-')}`;
 const addId=chooseId??`${id}-add`;
 const available=visible.filter(field=>editable(field));
 const required=visible.filter(field=>field.definition.active&&(field.side==='left'?field.definition.leftMin:field.definition.rightMin)>field.targets.length&&!field.restricted);
 const pickerRule=picker?(picker.side==='left'?picker.definition.leftApplicability:picker.definition.rightApplicability):undefined;
 const pickerController=fieldDefinitions.find(field=>field.id===pickerRule?.fieldId);
 const pickerSourceValues=pickerController?{[pickerController.technicalName]:values[pickerController.technicalName]??null}:undefined;
 const close=()=>{setPicker(null);onPickerDirtyChange(false);};
 return <Field className="min-w-0">
  <RecordTableToolbar search={<Field className="w-full sm:max-w-xs"><FieldLabel htmlFor={`${id}-search`} className="sr-only">{t('search')}</FieldLabel><InputGroup><InputGroupAddon><SearchIcon/></InputGroupAddon><InputGroupInput id={`${id}-search`} type="search" value={table.search} placeholder={t('search')} onChange={event=>table.onSearch(event.target.value)}/></InputGroup></Field>}>
   {!readOnly&&showAdd?(single?<Button id={addId} type="button" variant="outline" size="icon-sm" disabled={!available.length} aria-label={t('relationshipChooseFor',{name:title})} onClick={()=>setPicker(available[0])}><PlusIcon/></Button>:<DropdownMenu><DropdownMenuTrigger render={<Button id={addId} type="button" variant="outline" size="icon-sm" disabled={!available.length} aria-label={t('relationshipChooseFor',{name:title})}/>}><PlusIcon/></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup>{available.map(field=><DropdownMenuItem key={`${field.definition.id}:${field.side}`} onClick={()=>setPicker(field)}>{sideLabel(field)}</DropdownMenuItem>)}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu>):null}
  </RecordTableToolbar>
  {!single&&visible.some(field=>field.restricted)?<FieldDescription>{t('restrictedRelationshipHelp')}</FieldDescription>:null}
  {(!single?required:[]).map(field=><FieldError key={`${field.definition.id}:${field.side}`}>{sideLabel(field)} · {t('required')}</FieldError>)}
  <RecordDataTable rowActions={row=>editable(row.field)?<DropdownMenuItem onClick={()=>change(row.field,row.field.targets.filter(target=>relatedIdentity(target)!==relatedIdentity(row.target)))}><XIcon/>{t('removeRelationship',{name:row.keyword})}</DropdownMenuItem>:null} ariaLabel={title} rows={table.pagination.rows} columns={columns} hidden={new Set()} total={table.pagination.total} page={table.pagination.page} pageSize={table.pagination.pageSize} sort={sort} disabled={disabled} onSort={by=>{setSort({by,direction:sort.by===by&&sort.direction==='asc'?'desc':'asc'});table.pagination.onPage(1);}} onPage={table.pagination.onPage} onPageSize={table.pagination.onPageSize} onOpen={row=>{void navigate(path(row.target));}} getCopyId={row=>row.target.recordId} rowName={row=>row.keyword} labels={{empty:t(table.search?'noMatches':'noRelationships')}}/>
  {picker?<RelationshipPicker objectColumn={objectColumn} objectTypeId={objectTypeId} recordId={recordId} field={picker} title={sideLabel(picker)} sourceValues={pickerSourceValues} onClose={close} onApply={targets=>{change(picker,targets);close();}} onDirtyChange={onPickerDirtyChange} finalFocus={()=>document.getElementById(addId)??true}/>:null}
 </Field>;
}
