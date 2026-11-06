import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {ChevronDownIcon} from 'lucide-react';
import {formatRecordNumber,numberingPeriod,numberingSchema,type Numbering} from '@xobject/contracts';
import {Field,FieldGroup,FieldLabel,FieldDescription,FieldError,FieldSet,FieldLegend} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {Checkbox} from '@/components/ui/checkbox';
import {Button} from '@/components/ui/button';
import {Collapsible,CollapsibleContent,CollapsibleTrigger} from '@/components/ui/collapsible';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectGroup,SelectItem} from '@/components/ui/select';
import {SettingsSection} from './settings-section';
import {SettingsHelp} from './settings-help';
export function NumberingSettings({value,onChange,disabled,readOnly,timeZone}:{value:Numbering;onChange:(value:Numbering)=>void;disabled:boolean;readOnly:boolean;timeZone:string}){
 const {t}=useTranslation(),locked=disabled||readOnly,[open,setOpen]=useState(false);
 const validation=numberingSchema.safeParse(value),invalid=new Set(validation.success?[]:validation.error.issues.map(issue=>String(issue.path[0])));
 const example=validation.success?formatRecordNumber(value,value.start,numberingPeriod(value,new Date(),timeZone)):null;
 const restarts=(['never','yearly','monthly'] as const).map(value=>({value,label:t(`numberRestart_${value}`)}));
 return <SettingsSection><FieldSet className="min-w-0"><FieldLegend>{t('recordNumbering')}</FieldLegend><FieldGroup>
 <Field orientation="horizontal"><Checkbox id="numbering-enabled" disabled={locked} checked={value.enabled} onCheckedChange={checked=>{onChange({...value,enabled:checked===true});if(checked)setOpen(true);}}/><FieldLabel htmlFor="numbering-enabled">{t('enableRecordNumbering')}</FieldLabel></Field>
 {value.enabled?<><p className="wrap-anywhere text-sm text-muted-foreground" role="status">{example?t('numberingSummary',{example,restart:t(`numberRestart_${value.restart}`)}):t('numberingPreviewInvalid')}</p><Collapsible open={open||invalid.size>0} onOpenChange={setOpen} className="min-w-0"><CollapsibleTrigger className="group/numbering" render={<Button type="button" variant="outline" size="sm" disabled={disabled}/>}>{t('numberingConfigure')}<ChevronDownIcon data-icon="inline-end" className="transition-transform group-aria-expanded/numbering:rotate-180"/></CollapsibleTrigger><CollapsibleContent><FieldGroup className="pt-4"><FieldGroup className="grid items-start gap-4 sm:grid-cols-2">{(['prefix','suffix','start','increment','padding'] as const).map(key=><Field key={key} data-disabled={locked||undefined} data-invalid={invalid.has(key)||undefined}><FieldLabel htmlFor={`numbering-${key}`}>{t(`numbering_${key}`)}</FieldLabel><Input id={`numbering-${key}`} aria-invalid={invalid.has(key)||undefined} aria-describedby={invalid.has(key)?`numbering-${key}-error`:undefined} value={value[key]} readOnly={readOnly} disabled={disabled} maxLength={key==='prefix'||key==='suffix'?80:key==='padding'?2:30} inputMode={['start','increment','padding'].includes(key)?'numeric':undefined} onChange={e=>onChange({...value,[key]:key==='padding'?Number(e.target.value):e.target.value})}/>{invalid.has(key)?<FieldError id={`numbering-${key}-error`}>{t(key==='padding'?'numberingPaddingInvalid':'numberingIntegerInvalid')}</FieldError>:null}</Field>)}<Field><FieldLabel htmlFor="numbering-restart">{t('numbering_restart')}</FieldLabel><Select items={restarts} value={value.restart} disabled={locked} onValueChange={restart=>{if(restart)onChange({...value,restart});}}><SelectTrigger id="numbering-restart" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{restarts.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field></FieldGroup><FieldDescription>{t('numberingRestartHelp',{timezone:timeZone})}</FieldDescription></FieldGroup></CollapsibleContent></Collapsible></>:null}
 <SettingsHelp title={t('numberingRulesTitle')}>{t('numberingHelp')}</SettingsHelp>
 </FieldGroup></FieldSet></SettingsSection>;
}
