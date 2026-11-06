import test from 'node:test';
import assert from 'node:assert/strict';
import {taskCompletionProposal,workIssues,emptyClassification,temporalInstant,temporalSchema,defaultRegionalSettings} from '@xobject/contracts';
import {displayFieldValue} from '../src/lib/field-display';

test('Task completion drafts propose visible atomic values and preserve partial progress on reopening',()=>{
 const now='2026-11-05T11:00:00.000Z';
 assert.deepEqual(taskCompletionProposal(false,true,'50',now),{progress:'100',completed_at:now});
 assert.deepEqual(taskCompletionProposal(true,false,'100',now),{progress:null,completed_at:null});
 assert.deepEqual(taskCompletionProposal(true,false,'35',now),{progress:'35',completed_at:null});
 assert.equal(taskCompletionProposal(true,true,'100',now),undefined);
 const config=emptyClassification();config.options=[{id:'done',kind:'status',labels:{en:'Renamed'},active:true,typeId:null,meaning:'done'}];
 const fields=['progress','completed_at'].map(id=>({id,technicalName:id})),profile={kind:'task' as const,fields:Object.fromEntries(fields.map(f=>[f.id,f.id]))};
 assert.equal(workIssues(profile,fields,{status:'done',progress:'100',completed_at:now},config).length,0);
 assert.equal(workIssues(profile,fields,{status:null,progress:'100',completed_at:now},config)[0].code,'taskCompletionNotDone');
});

test('Temporal display keeps all-day values and domain zones independent of viewer settings',()=>{
 const field={kind:'structured' as const,config:{schema:'temporal' as const}},regional={...defaultRegionalSettings,dateFormat:'iso' as const,hourCycle:'h23' as const};
 const t=((key:string)=>key) as any;
 assert.equal(displayFieldValue(field,{kind:'date',date:'2026-11-05'},'en',t,[],'America/Los_Angeles',regional),'2026-11-05');
 const value=temporalSchema.parse({kind:'zoned',local:'2026-11-05T10:15:00',timeZone:'Europe/Berlin',occurrence:null});
 assert.equal(displayFieldValue(field,value,'en',t,[],'Asia/Tokyo',regional),'2026-11-05, 10:15 · Europe/Berlin');
 if(value.kind!=='date')assert.equal(temporalInstant(value),'2026-11-05T09:15:00.000Z');
});

test('task status configuration journals use translated meanings without interpreting record contents',async()=>{
 const {journalTaskStateValue,journalPropertyLabel}=await import('../src/lib/journal-presentation');
 const t=((key:string)=>key) as any;
 assert.equal(journalPropertyLabel('meaning',t),'taskStatusMeaning');
 assert.equal(journalTaskStateValue({entity_kind:'classification_option',field_key:'meaning'},'done',t),'taskState_done');
 assert.equal(journalTaskStateValue({entity_kind:'record',field_key:'meaning'},'done',t),undefined);
});


test('Project starter groups pair responsibility and numbering with Schedule without losing editable fields',async()=>{
 const {workFormLayout,formLayoutSchema,resolveFormLayout}=await import('@xobject/contracts');
 const fields=['keyword','record_number','description','responsible','start_date','target_date','notes','access_principals'].map((technicalName,index)=>({id:`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,technicalName,kind:['description','notes'].includes(technicalName)?'multiline':'text',config:{}}));
 const profile={kind:'project' as const,fields:Object.fromEntries(fields.map(field=>[field.technicalName,field.id]))};
 const layout=workFormLayout(profile,fields,[]),details=layout.groups.find(group=>group.id==='project_details')!,schedule=layout.groups.find(group=>group.id==='schedule')!;
 assert.equal(details.width,'half');assert.equal(schedule.width,'half');
 assert.deepEqual(details.fields.map(entry=>'fieldId'in entry?entry.fieldId:null),[profile.fields.record_number,profile.fields.responsible,profile.fields.access_principals]);
 assert.equal(layout.groups.indexOf(schedule),layout.groups.indexOf(details)+1);
 const parsed=formLayoutSchema.parse(layout);assert.deepEqual(resolveFormLayout(parsed,fields,true,[]),parsed);
 assert.equal(layout.groups.flatMap(group=>group.fields).filter(entry=>'fieldId'in entry).length,fields.length);
 const taskLayout=workFormLayout({...profile,kind:'task'},fields,[]);assert.deepEqual(taskLayout.groups.find(g=>g.id==='task_details')!.fields,details.fields);assert.equal(taskLayout.groups.find(g=>g.id==='schedule')!.width,'half');
 const caseLayout=workFormLayout({...profile,kind:'case'},fields,[]);assert.deepEqual(caseLayout.groups.map(g=>g.width),layout.groups.map(g=>g.width));assert.deepEqual(caseLayout.groups.find(g=>g.id==='case_details')!.fields,details.fields);assert.equal(workIssues({...profile,kind:'case'},fields,{start_date:'2026-11-06',target_date:'2026-11-05'},emptyClassification())[0].code,'workDateOrder');
});
