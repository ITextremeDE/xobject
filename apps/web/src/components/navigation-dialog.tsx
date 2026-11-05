import {notifySuccess} from '@/lib/notifications';
import {useRef,useState,type ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {defaultNavigationLayout,navigationChildren,moveNavigationNode,type NavigationSettings,type NavigationLayout,type NavigationNode} from '@xobject/contracts';
import {ArrowUpIcon,ArrowDownIcon,GripVerticalIcon} from 'lucide-react';
import {api} from '@/lib/api';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './ui/dialog';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from './ui/alert-dialog';
import {Field,FieldGroup,FieldLabel,FieldDescription,FieldSet,FieldLegend} from './ui/field';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectGroup,SelectItem} from './ui/select';
import {Button} from './ui/button';
import {Kbd} from './ui/kbd';
import {Spinner} from './ui/spinner';
import {keyboardCommands,saveShortcutLabel} from '@/lib/keyboard';
import {Checkbox} from './ui/checkbox';
import {Separator} from './ui/separator';
import {SettingsSection} from './settings-section';
import {DialogActions} from './dialog-actions';
import {Alert,AlertDescription} from './ui/alert';
import {ErrorNotice} from './feedback';

export function NavigationDialog({settings,workspaceId,onClose,onDirtyChange,onBusyChange,finalFocus}:{finalFocus?:()=>HTMLElement|boolean;settings:NavigationSettings;workspaceId:string;onClose:()=>void;onDirtyChange:(dirty:boolean)=>void;onBusyChange:(busy:boolean)=>void}){
 const {t,i18n}=useTranslation(),client=useQueryClient();
 const [scope,setScope]=useState<'personal'|'workspace'>('personal'),[snapshot,setSnapshot]=useState(settings),[draft,setDraft]=useState<NavigationLayout|null>(settings.personal.layout),[discard,setDiscard]=useState(false),[announcement,setAnnouncement]=useState('');
 const baseline=snapshot[scope].layout,layout=draft??(scope==='personal'?snapshot.workspace.layout:null)??defaultNavigationLayout(),dirty=JSON.stringify(draft)!==JSON.stringify(baseline);
 const nodes=snapshot.nodes.filter(n=>n.available&&(scope==='workspace'||n.permitted));
 const label=(node:NavigationNode)=>node.labels[i18n.language]??node.labels.en??node.labels.de??Object.values(node.labels)[0];
 const mutation=useMutation({mutationFn:()=>api('configure_navigation',{workspaceId,scope,version:snapshot[scope].version,layout:draft}),onMutate:()=>onBusyChange(true),onSuccess:async result=>{setSnapshot(result);setDraft(result[scope].layout);onDirtyChange(false);notifySuccess(t('saved'));await client.invalidateQueries({queryKey:['workspace-navigation',workspaceId]});},onSettled:()=>onBusyChange(false)});
 function change(next:NavigationLayout|null){setDraft(next);onDirtyChange(JSON.stringify(next)!==JSON.stringify(baseline));mutation.reset();}
 function close(){if(mutation.isPending)return;if(dirty)setDiscard(true);else{onDirtyChange(false);onClose();}}
 function move(id:string,target:string,focus='handle'){
  const next=moveNavigationNode(snapshot.nodes,layout,id,target);if(next===layout)return;change(next);
  const node=nodes.find(n=>n.id===id)!;const siblings=navigationChildren(nodes,node.parentId,next,true);setAnnouncement(t('choiceMoved',{name:label(node),position:siblings.findIndex(n=>n.id===id)+1,count:siblings.length}));
  requestAnimationFrame(()=>{const button=document.getElementById(`navigation-${focus}-${id}`) as HTMLButtonElement|null;(button&&!button.disabled?button:document.getElementById(`navigation-handle-${id}`))?.focus();});
 }
 function visible(id:string,checked:boolean){change({...layout,hidden:checked?layout.hidden.filter(key=>key!==id):[...layout.hidden,id]});}
 function rows(parentId:string|null,depth=0):ReactNode{
  const siblings=navigationChildren(nodes,parentId,layout,true);
  return siblings.map((node,index)=><div key={node.id} role={depth===0?'group':undefined} aria-label={depth===0?label(node):undefined} className="flex min-w-0 flex-col gap-3">
   <NavigationEditorRow node={node} name={label(node)} contextName={node.parentId?`${label(node)} · ${label(snapshot.nodes.find(n=>n.id===node.parentId)!)}`:label(node)} checked={!layout.hidden.includes(node.id)} disabled={mutation.isPending} onVisible={checked=>visible(node.id,checked)} onMove={target=>move(node.id,target)} onUp={index?()=>move(node.id,siblings[index-1].id,'up'):undefined} onDown={index<siblings.length-1?()=>move(node.id,siblings[index+1].id,'down'):undefined}/>
   {depth<2&&navigationChildren(nodes,node.id,layout,true).length?<div className="ml-3 flex min-w-0 flex-col gap-3 border-l pl-3">{rows(node.id,depth+1)}</div>:null}
   {depth===0&&index<siblings.length-1?<Separator/>:null}
  </div>);
 }
 return <><Dialog open onOpenChange={value=>{if(!value)close();}}><DialogContent finalFocus={finalFocus} className="flex max-h-[85svh] flex-col overflow-hidden p-0 sm:max-w-2xl" closeButtonDisabled={mutation.isPending}>
  <DialogHeader className="shrink-0 px-4 pt-4 pr-12"><DialogTitle>{t('customizeNavigation')}</DialogTitle><DialogDescription>{t('navigationDescription')}</DialogDescription></DialogHeader>
  <div className="min-h-0 overflow-y-auto px-4 pb-4"><form id="navigation-form" data-shortcut-submit onSubmit={event=>{event.preventDefault();if(dirty&&!mutation.isPending)mutation.mutate();}}><FieldGroup>
   <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
   {mutation.isError?<ErrorNotice error={mutation.error}/>:null}
   <Field><FieldLabel htmlFor="navigation-scope">{t('navigationScope')}</FieldLabel><Select items={[{value:'personal',label:t('navigationPersonal')},...(snapshot.canManage?[{value:'workspace',label:t('navigationWorkspace')}]:[])]} value={scope} disabled={dirty||mutation.isPending} onValueChange={next=>{if(next){setScope(next as typeof scope);setDraft(snapshot[next as typeof scope].layout);mutation.reset();}}}><SelectTrigger id="navigation-scope" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="personal">{t('navigationPersonal')}</SelectItem>{snapshot.canManage?<SelectItem value="workspace">{t('navigationWorkspace')}</SelectItem>:null}</SelectGroup></SelectContent></Select><FieldDescription>{t(scope==='personal'?'navigationPersonalHelp':'navigationWorkspaceHelp')}</FieldDescription></Field>
   <SettingsSection><FieldSet><FieldLegend>{t('navigationStructure')}</FieldLegend><FieldDescription>{t('navigationSortHelp')}</FieldDescription><div className="flex min-w-0 flex-col gap-4">{rows(null)}</div></FieldSet></SettingsSection>
   <Field orientation="horizontal"><Checkbox id="navigation-resources" checked={layout.resources} disabled={mutation.isPending} onCheckedChange={next=>change({...layout,resources:next===true})}/><FieldLabel htmlFor="navigation-resources">{t('navigationResources')}</FieldLabel></Field>
   <Button type="button" variant="outline" className="w-fit" disabled={mutation.isPending||draft===null} onClick={()=>change(null)}>{t(scope==='personal'?'navigationUseWorkspace':'navigationUseModuleDefaults')}</Button>
  </FieldGroup></form></div>
  <DialogActions className="border-t p-4" onClose={close} disabled={mutation.isPending}><Button type="button" variant="outline" disabled={!dirty||mutation.isPending} onClick={()=>{setDraft(baseline);onDirtyChange(false);mutation.reset();}}>{t('resetPreferences')}</Button><Button type="submit" form="navigation-form" aria-keyshortcuts={keyboardCommands.save.aria} disabled={!dirty||mutation.isPending}>{mutation.isPending?<Spinner aria-hidden="true" data-icon="inline-start"/>:null}{t(mutation.isPending?'saving':'save')}<Kbd>{saveShortcutLabel}</Kbd></Button></DialogActions>
 </DialogContent></Dialog><AlertDialog open={discard} onOpenChange={setDiscard}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('unsaved')}</AlertDialogTitle><AlertDialogDescription>{t('unsavedDescription')}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={()=>{onDirtyChange(false);onClose();}}>{t('discard')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
function NavigationEditorRow({node,name,contextName,checked,disabled,onVisible,onMove,onUp,onDown}:{node:NavigationNode;name:string;contextName:string;checked:boolean;disabled:boolean;onVisible:(checked:boolean)=>void;onMove:(id:string)=>void;onUp?:()=>void;onDown?:()=>void}){
 const {t}=useTranslation(),drag=useRef<{x:number;y:number}|null>(null);
 return <div data-navigation-drop={node.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2"><Field orientation="horizontal" className="min-w-0 flex-1"><Checkbox id={`nav-visible-${node.id}`} checked={checked} aria-label={contextName} disabled={disabled} onCheckedChange={value=>onVisible(value===true)}/><FieldLabel htmlFor={`nav-visible-${node.id}`} className="min-w-0 wrap-anywhere">{name}</FieldLabel></Field><div className="flex shrink-0 gap-1">
  <Button type="button" variant="ghost" size="icon-sm" id={`navigation-handle-${node.id}`} className="touch-none" disabled={disabled||(!onUp&&!onDown)} aria-label={t('dragChoice',{name:contextName})} title={t('dragChoice',{name:contextName})} onPointerDown={event=>{if(event.button!==0)return;drag.current={x:event.clientX,y:event.clientY};event.currentTarget.setPointerCapture(event.pointerId);}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}} onKeyDown={event=>{if(event.key==='Escape'&&drag.current){drag.current=null;event.preventDefault();event.stopPropagation();}}} onPointerUp={event=>{const start=drag.current;drag.current=null;if(!start||Math.hypot(event.clientX-start.x,event.clientY-start.y)<6)return;const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-navigation-drop]')?.getAttribute('data-navigation-drop');if(target)onMove(target);}}><GripVerticalIcon/></Button>
  <Button type="button" variant="ghost" size="icon-sm" disabled={disabled||!onUp} id={`navigation-up-${node.id}`} aria-label={t('moveChoiceUp',{name:contextName})} onClick={onUp}><ArrowUpIcon/></Button><Button type="button" variant="ghost" size="icon-sm" disabled={disabled||!onDown} id={`navigation-down-${node.id}`} aria-label={t('moveChoiceDown',{name:contextName})} onClick={onDown}><ArrowDownIcon/></Button>
 </div></div>;
}
