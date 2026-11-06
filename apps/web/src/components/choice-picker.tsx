import {useTransientDraft} from '@/lib/transient-draft';
import {useId,useRef,useState,useEffect} from 'react';
import {useTranslation} from 'react-i18next';
import {choiceDisplayOrder,choiceAncestors,closeChoiceSelection,toggleChoiceSelection,type ChoiceNode} from '@xobject/contracts';
import {ListFilterIcon,ChevronRightIcon} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './ui/dialog';
import {DialogActions} from './dialog-actions';
import {InputGroup,InputGroupInput,InputGroupAddon,InputGroupButton} from './ui/input-group';
import {Input} from './ui/input';
import {Button} from './ui/button';
import {Field,FieldLabel,FieldDescription,FieldGroup} from './ui/field';
import {Checkbox} from './ui/checkbox';
import {Collapsible,CollapsibleContent,CollapsibleTrigger} from './ui/collapsible';
import {Empty,EmptyHeader,EmptyTitle} from './ui/empty';
export type PickerChoice=ChoiceNode&{label:string};
/** One local dialog draft for choice lists and trees. Apply edits the enclosing form only. */
export function ChoicePicker({id,label,options,value,onChange,tree=false,disabled=false,required=false,describedBy,invalid=false}:{id:string;label:string;options:PickerChoice[];value:string[];onChange:(value:string[])=>void;tree?:boolean;disabled?:boolean;required?:boolean;describedBy?:string;invalid?:boolean}){
 const {t}=useTranslation(),[open,setOpen]=useState(false),[draft,setDraft]=useState(value),[baseline,setBaseline]=useState(value),[search,setSearch]=useState(''),[expanded,setExpanded]=useState<Set<string>>(()=>new Set(options.filter(option=>!option.parentId).map(option=>option.id))),[active,setActive]=useState(''),treeRef=useRef<HTMLUListElement>(null),uid=useId();
 const valueKey=JSON.stringify([...value].sort()),baselineKey=JSON.stringify([...baseline].sort());
 const changed=JSON.stringify([...draft].sort())!==baselineKey;
 useEffect(()=>{if(open&&!changed&&valueKey!==baselineKey){setDraft([...value]);setBaseline([...value]);setExpanded(new Set([...options.filter(option=>!option.parentId).map(option=>option.id),...(tree?value.flatMap(id=>choiceAncestors(options,id)):[])]));}},[open,changed,valueKey,baselineKey,options,tree]);
 useTransientDraft(uid,open&&changed);
 const summary=choiceDisplayOrder(options,tree).filter(option=>value.includes(option.id)).map(option=>option.label).join(', '),selected=new Set(draft),query=search.trim().toLocaleLowerCase();
 const visible=new Set(options.filter(option=>option.active||selected.has(option.id)).filter(option=>!query||option.label.toLocaleLowerCase().includes(query)).flatMap(option=>[option.id,...(tree?choiceAncestors(options,option.id):[])]));
 const items=options.filter(option=>visible.has(option.id));
 function toggle(option:PickerChoice,checked:boolean){const next=toggleChoiceSelection(options,draft,option.id,checked,tree);if(next.length<=100){setDraft(next);if(tree&&checked)setExpanded(old=>new Set([...old,...choiceAncestors(options,option.id)]));}}
 const cannotAdd=(option:PickerChoice)=>!selected.has(option.id)&&(!option.active||(tree?closeChoiceSelection(options,[...draft,option.id]).length:draft.length+1)>100);
 function keyDown(event:React.KeyboardEvent<HTMLElement>,option:PickerChoice){
  if(event.target instanceof Element&&event.target.closest('button'))return;
  const rows=[...treeRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]')??[]].filter(row=>row.getClientRects().length),index=rows.indexOf(event.currentTarget),children=items.some(child=>child.parentId===option.id);let target:HTMLElement|undefined;
  if(event.key==='ArrowDown')target=rows[Math.min(index+1,rows.length-1)];else if(event.key==='ArrowUp')target=rows[Math.max(index-1,0)];else if(event.key==='Home')target=rows[0];else if(event.key==='End')target=rows.at(-1);
  else if(event.key==='ArrowRight'){if(children&&!expanded.has(option.id)&&!query)setExpanded(old=>new Set([...old,option.id]));else if(children)target=rows[index+1];}
  else if(event.key==='ArrowLeft'){if(children&&expanded.has(option.id)&&!query)setExpanded(old=>new Set([...old].filter(id=>id!==option.id)));else target=rows.find(row=>row.dataset.choiceId===option.parentId);}
  else if(event.key===' '||event.key==='Enter'){if(!cannotAdd(option))toggle(option,!selected.has(option.id));}
  else return;event.preventDefault();event.stopPropagation();if(target){setActive(target.dataset.choiceId!);target.focus();}
 }
 function nodes(parentId:string|null,level=1):React.ReactNode{
  return items.filter(option=>(option.parentId??null)===parentId).map(option=>{
   const children=items.some(child=>child.parentId===option.id),isOpen=Boolean(query)||expanded.has(option.id),checkboxId=`${uid}-${option.id}`;
   return <Collapsible key={option.id} open={isOpen} onOpenChange={next=>setExpanded(old=>{const result=new Set(old);if(next)result.add(option.id);else result.delete(option.id);return result;})} render={<li role="treeitem" aria-level={level} aria-checked={selected.has(option.id)} aria-expanded={children?isOpen:undefined} aria-label={option.label} aria-disabled={cannotAdd(option)||undefined} data-choice-id={option.id} tabIndex={(active||items[0]?.id)===option.id?0:-1} className="min-w-0 rounded-md focus-visible:outline-2 focus-visible:outline-ring" onFocus={event=>{if(event.target===event.currentTarget)setActive(option.id);}} onKeyDown={event=>keyDown(event,option)}/>}>
    <div className="flex min-h-10 items-center gap-2 px-2">
     {children?<CollapsibleTrigger tabIndex={-1} aria-label={t(isOpen?'choiceCollapse':'choiceExpand',{name:option.label})} render={<Button type="button" variant="ghost" size="icon-sm"/>}><ChevronRightIcon className={isOpen?'rotate-90':undefined}/></CollapsibleTrigger>:<span className="size-7 shrink-0"/>}
     <Field orientation="horizontal" className="min-w-0 flex-1" data-disabled={cannotAdd(option)||undefined}><Checkbox id={checkboxId} tabIndex={-1} checked={selected.has(option.id)} disabled={cannotAdd(option)} onCheckedChange={checked=>toggle(option,checked===true)}/><FieldLabel htmlFor={checkboxId} className="min-w-0 flex-1 wrap-anywhere">{option.label}{!option.active?` (${t('inactiveChoice')})`:''}</FieldLabel></Field>
    </div>
    {children?<CollapsibleContent><ul role="group" className="ml-6 flex min-w-0 flex-col gap-1">{nodes(option.id,level+1)}</ul></CollapsibleContent>:null}
   </Collapsible>;
  });
 }
 return <><InputGroup data-disabled={disabled||undefined}><InputGroupInput id={id} aria-label={label} aria-describedby={describedBy} aria-invalid={invalid} aria-required={required} readOnly value={summary} placeholder={t('noSelection')} title={summary||undefined} disabled={disabled}/><InputGroupAddon align="inline-end"><InputGroupButton aria-label={t('chooseFieldValues',{name:label})} title={t('chooseFieldValues',{name:label})} disabled={disabled} onClick={()=>{setDraft([...value]);setBaseline([...value]);setSearch('');setActive('');setExpanded(new Set([...options.filter(option=>!option.parentId).map(option=>option.id),...(tree?value.flatMap(id=>choiceAncestors(options,id)):[])]));setOpen(true);}}><ListFilterIcon/></InputGroupButton></InputGroupAddon></InputGroup>
 <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-xl"><form id={`${uid}-form`} data-shortcut-submit className="flex min-h-0 flex-col gap-4" onSubmit={event=>{event.preventDefault();event.stopPropagation();if(changed&&(!required||draft.length)){onChange([...draft]);setOpen(false);}}}><DialogHeader><DialogTitle>{label}</DialogTitle><DialogDescription>{t(tree?'choiceTreeHelp':'choiceListHelp')}</DialogDescription></DialogHeader><FieldGroup><Field><FieldLabel htmlFor={`${uid}-search`}>{t('searchChoices')}</FieldLabel><Input id={`${uid}-search`} value={search} onChange={event=>{setSearch(event.target.value);setActive('');}} placeholder={t('searchChoices')}/></Field><div className="max-h-[50svh] overflow-y-auto">{!items.length?<Empty><EmptyHeader><EmptyTitle>{t('noChoices')}</EmptyTitle></EmptyHeader></Empty>:tree?<ul ref={treeRef} role="tree" aria-label={label} aria-multiselectable="true" className="flex flex-col gap-1">{nodes(null)}</ul>:<FieldGroup>{items.map(option=><Field key={option.id} orientation="horizontal" data-disabled={cannotAdd(option)||undefined}><Checkbox id={`${uid}-${option.id}`} checked={selected.has(option.id)} disabled={cannotAdd(option)} onCheckedChange={checked=>toggle(option,checked===true)}/><FieldLabel htmlFor={`${uid}-${option.id}`}>{option.label}{!option.active?` (${t('inactiveChoice')})`:''}</FieldLabel></Field>)}</FieldGroup>}</div><FieldDescription>{t(tree?'choiceTreeSelectionCount':'choiceSelectionCount',{count:draft.length,max:100})}</FieldDescription></FieldGroup><DialogActions onClose={()=>setOpen(false)} closeLabel={t('cancel')}><Button type="button" variant="outline" disabled={!draft.length} onClick={()=>setDraft([])}>{t('clearSelection')}</Button><Button type="submit" disabled={!changed||required&&!draft.length}>{t('applyChoiceSelection')}</Button></DialogActions></form></DialogContent></Dialog></>;
}
