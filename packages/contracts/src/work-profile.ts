import type {ClassificationRules} from './classification.js';
import {compareTemporal,temporalSchema} from './temporal.js';
export interface WorkProfile {kind:'project'|'case'|'task';fields:Record<string,string>}
export type WorkIssue={fieldId:string;code:'workDateOrder'|'taskTimeOrder'|'taskTimeKind'|'taskProgressRange'|'taskCompletionRequired'|'taskCompletionNotDone'};
export function workIssues(profile:WorkProfile|undefined,fields:{id:string;technicalName:string}[],values:Record<string,unknown>,classification:ClassificationRules):WorkIssue[]{
 if(!profile)return [];
 const name=(key:string)=>fields.find(field=>field.id===profile.fields[key])?.technicalName;
 const get=(key:string)=>{const n=name(key);return n?values[n]:null;};
 const issues:WorkIssue[]=[],add=(key:string,code:WorkIssue['code'])=>{if(profile.fields[key])issues.push({fieldId:profile.fields[key],code});};
 if((profile.kind==='project'||profile.kind==='case')&&get('start_date')&&get('target_date')&&String(get('target_date'))<String(get('start_date')))add('target_date','workDateOrder');
 if(profile.kind==='task'){
  const start=temporalSchema.safeParse(get('start')),due=temporalSchema.safeParse(get('due'));
  if(start.success&&due.success){const order=compareTemporal(start.data,due.data);if(order===undefined)add('due','taskTimeKind');else if(order>=0)add('due','taskTimeOrder');}
  const progress=get('progress'),completed=get('completed_at'),done=classification.options.find(option=>option.id===values.status)?.meaning==='done';
  if(progress!==null&&progress!==undefined&&(!/^\d{1,3}$/.test(String(progress))||Number(progress)>100))add('progress','taskProgressRange');
  if(done&&(Number(progress)!==100||!completed))add('completed_at','taskCompletionRequired');
  if(!done&&(completed!=null||Number(progress)===100))add('completed_at','taskCompletionNotDone');
 }
 return issues;
}
/** Visible form proposal only: writers still validate the complete resulting record. */
export function taskCompletionProposal(wasDone:boolean,isDone:boolean,progress:unknown,now:string):{progress:string|null;completed_at:string|null}|undefined{
 if(wasDone===isDone)return undefined;
 return isDone?{progress:'100',completed_at:now}:{progress:Number(progress)===100?null:progress==null?null:String(progress),completed_at:null};
}

import {resolveFormLayout,type FormLayout,type FormRelationship} from './form-layout.js';
import type {FieldConfig} from './field-types.js';
/** Editable module starter layout. Bindings identify domain fields independently of labels. */
export function workFormLayout(profile:WorkProfile,fields:{id:string;technicalName:string;kind:string;config:FieldConfig}[],relationships:FormRelationship[]):FormLayout{
 const layout=resolveFormLayout(undefined,fields,true,relationships),scheduleIds=new Set(['start_date','target_date','start','due','progress','completed_at'].map(key=>profile.fields[key]).filter(Boolean));
 const schedule={id:'schedule',labels:{en:profile.kind==='task'?'Schedule & progress':'Schedule',de:profile.kind==='task'?'Zeitplan & Fortschritt':'Zeitplan'},fields:layout.groups.flatMap(g=>g.fields).filter(e=>'fieldId'in e&&scheduleIds.has(e.fieldId))};
 for(const group of layout.groups)group.fields=group.fields.filter(e=>!('fieldId'in e)||!scheduleIds.has(e.fieldId));
 const priority=profile.fields.priority;
 if(priority){for(const group of layout.groups)group.fields=group.fields.filter(e=>!('fieldId'in e)||e.fieldId!==priority);layout.groups.find(g=>g.id==='classification')?.fields.push({fieldId:priority,width:'half'});}
 schedule.fields=schedule.fields.map(entry=>'fieldId'in entry?{...entry,width:'half'}:entry);
 const detailsIds=new Set([fields.find(field=>field.technicalName==='business_number')?.id,profile.fields.responsible,fields.find(field=>field.technicalName==='access_principals')?.id].filter(Boolean));
 const details=[...detailsIds].flatMap(id=>layout.groups.flatMap(group=>group.fields).filter(entry=>'fieldId'in entry&&entry.fieldId===id));
 for(const group of layout.groups)group.fields=group.fields.filter(entry=>!('fieldId'in entry)||!detailsIds.has(entry.fieldId));
 const detailsLabels={project:{en:'Project details',de:'Projektdetails'},case:{en:'Case details',de:'Vorgangsdetails'},task:{en:'Task details',de:'Aufgabendetails'}};
 if(details.length)layout.groups.splice(1,0,{id:`${profile.kind}_details`,labels:detailsLabels[profile.kind],width:'half',fields:details.map(entry=>({...entry,width:'full'}))});
 if(schedule.fields.length)layout.groups.splice(details.length?2:1,0,{...schedule,width:'half',fields:schedule.fields.map(entry=>({...entry,width:'full'}))});

 return layout;
}
