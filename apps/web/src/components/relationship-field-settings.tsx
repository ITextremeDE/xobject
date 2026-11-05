import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import {PlusIcon} from 'lucide-react';
import type {RelationshipType,ObjectDefinition} from '@xobject/contracts';
import {api} from '@/lib/api';
import {FieldEditorDialog} from './field-attributes-dialog';
import {SettingsSection} from './settings-section';
import {FieldSet,FieldLegend,FieldDescription} from './ui/field';
import {Button} from './ui/button';
import {TableHeader,TableHead,TableBody,TableRow,TableCell} from './ui/table';
import {SettingsTable,useSettingsTable,SettingsTableSearch} from './settings-table';
import {ClientTablePagination} from './client-table-pagination';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from './ui/alert-dialog';
export function RelationshipFieldSettings({row,workspaceId,disabled,readOnly,onDirtyChange,onBusyChange}:{row:RelationshipType;workspaceId:string;disabled:boolean;readOnly:boolean;onDirtyChange:(v:boolean)=>void;onBusyChange:(v:boolean)=>void}){
 const {t,i18n}=useTranslation(),[selected,setSelected]=useState<string|null>(null),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false);
 const endpoint=useQuery({queryKey:['definition',row.pairs[0]?.leftObjectTypeId,'edge-settings'],queryFn:()=>api('get_object_type',{objectTypeId:row.pairs[0].leftObjectTypeId}),enabled:Boolean(selected&&row.pairs[0])});
 const fields=(row.fields??[]).filter(f=>f.state!=='deleted').map(f=>({...f,label:f.labels[i18n.language]??f.label})).sort((a,b)=>a.label.localeCompare(b.label,i18n.language));
 const table=useSettingsTable(fields,f=>`${f.label} ${f.technicalName}`);
 const context=endpoint.data?{...endpoint.data,label:row.labels[i18n.language as 'de'|'en']??row.labels.en??row.technicalName,fields}:undefined;
 const close=()=>{if(!busy){if(dirty)setConfirm(true);else setSelected(null);}};
 return <SettingsSection><FieldSet><FieldLegend>{t('relationshipAttributes')}</FieldLegend><FieldDescription>{t('relationshipFieldDefinitionHelp')}</FieldDescription><div className="flex flex-wrap items-center justify-between gap-3"><SettingsTableSearch value={table.search} onChange={table.onSearch} disabled={disabled||busy}/>{!readOnly?<Button type="button" variant="outline" disabled={disabled||busy} onClick={()=>setSelected('new')}><PlusIcon data-icon="inline-start"/>{t('newField')}</Button>:null}</div><SettingsTable aria-label={t('relationshipAttributes')}><TableHeader><TableRow><TableHead>{t('fieldName')}</TableHead><TableHead>{t('fieldType')}</TableHead><TableHead>{t('requiredField')}</TableHead></TableRow></TableHeader><TableBody>{table.pagination.rows.map(f=><TableRow key={f.id} onClick={event=>{if(!disabled&&!busy&&!event.defaultPrevented&&event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey&&event.target instanceof Element&&!event.target.closest('button,a,input')&&!window.getSelection()?.toString())setSelected(f.id);}}><TableCell><Button type="button" variant="link" className="h-auto justify-start px-0" disabled={disabled||busy} onClick={()=>setSelected(f.id)}>{f.label}</Button></TableCell><TableCell>{t(`fieldKind_${f.kind}`)}</TableCell><TableCell>{t(f.required?'yes':'no')}</TableCell></TableRow>)}{!table.pagination.total?<TableRow><TableCell colSpan={3}>{t('noFieldsYet')}</TableCell></TableRow>:null}</TableBody></SettingsTable><ClientTablePagination pagination={table.pagination} countLabel={t('fieldCount',{count:table.pagination.total})}/></FieldSet>
 {selected&&context?<FieldEditorDialog relationshipTypeId={row.id} definition={context} field={fields.find(f=>f.id===selected)} readOnly={readOnly} onClose={close} onCreated={()=>{setSelected(null);setDirty(false);onDirtyChange(false);}} onDeleted={()=>setSelected(null)} onDirtyChange={v=>{setDirty(v);onDirtyChange(v);}} onBusyChange={v=>{setBusy(v);onBusyChange(v);}}/>:null}
 <AlertDialog open={confirm} onOpenChange={setConfirm}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('unsaved')}</AlertDialogTitle><AlertDialogDescription>{t('unsavedDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={()=>{setSelected(null);setDirty(false);onDirtyChange(false);setConfirm(false);}}>{t('discard')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </SettingsSection>;
}
