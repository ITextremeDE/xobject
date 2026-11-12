import {useRef,type ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import {ArrowUpIcon,ArrowDownIcon,GripVerticalIcon,Trash2Icon,ChevronDownIcon} from 'lucide-react';
import type {Labels} from '@xobject/contracts';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Checkbox} from '@/components/ui/checkbox';
import {Collapsible,CollapsibleTrigger,CollapsibleContent} from '@/components/ui/collapsible';
import {Field,FieldLabel,FieldGroup,FieldDescription} from '@/components/ui/field';
import {TranslatedLabelInput,hasLabel} from './translated-label-input';

type Props={id:string;labels:Labels;active:boolean;readOnly:boolean;disabled:boolean;onLabels:(labels:Labels)=>void;onActive:(active:boolean)=>void;onUp?:()=>void;onDown?:()=>void;onMoveTo?:(id:string)=>void;onDelete?:()=>void;deleteBlocked?:string;children?:ReactNode};
/** One compact, keyboard-accessible choice editor for classification and custom fields. */
export function ChoiceValueEditor({id,labels,active,readOnly,disabled,onLabels,onActive,onUp,onDown,onMoveTo,onDelete,deleteBlocked,children}:Props){
  const {t,i18n}=useTranslation();
  const name=labels[i18n.language]??labels.en??labels.de??Object.values(labels)[0]??t('unnamedOption');
  const drag=useRef<{x:number;y:number}|null>(null);
  return <Collapsible defaultOpen={!hasLabel(labels)} className="min-w-0" data-choice-drop={id}>
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <CollapsibleTrigger render={<Button type="button" variant="ghost" className="group/choice h-auto min-h-8 min-w-0 flex-1 justify-start whitespace-normal text-left"/>} id={`choice-toggle-${id}`} aria-label={t('editChoice',{name})}><ChevronDownIcon data-icon="inline-start" className="transition-transform group-aria-expanded/choice:rotate-180"/><span className="min-w-0 wrap-anywhere">{name}</span>{!active?<Badge variant="outline">{t('inactive')}</Badge>:null}</CollapsibleTrigger>
      {!readOnly?<div className="flex shrink-0 gap-1">
        {onMoveTo?<Button type="button" variant="ghost" size="icon-sm" className="touch-none" data-choice-handle={id} disabled={disabled||(!onUp&&!onDown)} aria-label={t('dragChoice',{name})} title={t('dragChoice',{name})} onPointerDown={event=>{if(event.button!==0||disabled)return;drag.current={x:event.clientX,y:event.clientY};event.currentTarget.setPointerCapture(event.pointerId);}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}} onKeyDown={event=>{if(event.key==='Escape'&&drag.current){drag.current=null;event.preventDefault();event.stopPropagation();}}} onPointerUp={event=>{const start=drag.current;drag.current=null;if(!start||disabled||Math.hypot(event.clientX-start.x,event.clientY-start.y)<6)return;const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-choice-drop]')?.getAttribute('data-choice-drop');if(target)onMoveTo(target);}}><GripVerticalIcon/></Button>:null}
        <Button type="button" variant="ghost" size="icon-sm" disabled={disabled||!onUp} aria-label={t('moveChoiceUp',{name})} title={t('moveChoiceUp',{name})} onClick={onUp}><ArrowUpIcon/></Button>
        <Button type="button" variant="ghost" size="icon-sm" disabled={disabled||!onDown} aria-label={t('moveChoiceDown',{name})} title={t('moveChoiceDown',{name})} onClick={onDown}><ArrowDownIcon/></Button>
        {onDelete?<Button type="button" variant="ghost" size="icon-sm" disabled={disabled||Boolean(deleteBlocked)} aria-label={t('deleteChoice',{name})} title={deleteBlocked??t('deleteChoice',{name})} onClick={onDelete}><Trash2Icon/></Button>:null}
      </div>:null}
    </div>
    <CollapsibleContent className="pt-3 pb-2"><FieldGroup className="gap-3">
      <TranslatedLabelInput id={`choice-label-${id}`} value={labels} readOnly={readOnly} disabled={disabled} showHelp={false} onChange={onLabels}/>
      {children}
      <Field orientation="horizontal" data-disabled={disabled||undefined}><Checkbox id={`choice-active-${id}`} checked={active} disabled={readOnly||disabled} onCheckedChange={value=>onActive(value===true)}/><FieldLabel htmlFor={`choice-active-${id}`}>{t('activeChoice')}</FieldLabel></Field>
      {deleteBlocked?<FieldDescription>{deleteBlocked}</FieldDescription>:null}
    </FieldGroup></CollapsibleContent>
  </Collapsible>;
}
