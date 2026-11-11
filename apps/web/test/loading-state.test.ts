import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router';
import i18next from 'i18next';
import {I18nextProvider} from 'react-i18next';
import {RecordDataTable} from '../src/components/record-data-table.js';
import {RecordPageLoading} from '../src/components/loading.js';

test('record loading reserves actions and footer without guessing unknown tabs',async()=>{
 const i18n=i18next.createInstance();await i18n.init({lng:'en',resources:{en:{translation:{loading:'Loading…',recordFormActions:'Record actions',details:'Details',recordTree:'Tree',recordDossier:'Dossier',journal:'Journal'}}}});
 const render=(props:Parameters<typeof RecordPageLoading>[0])=>renderToStaticMarkup(createElement(I18nextProvider,{i18n},createElement(RecordPageLoading,props)));
 const unknown=render({});
 assert.match(unknown,/<footer[^>]*sticky[^>]*mt-auto/);
 assert.match(unknown,/min-h-\[calc\(100svh-8rem\)\]/);
 assert.doesNotMatch(unknown,/role="tab"/,'unknown module state has a neutral tab slot');
 const known=render({treeAvailable:true});
 assert.equal((known.match(/role="tab"/g)??[]).length,4);
 const fresh=render({isNew:true});
 assert.equal((fresh.match(/role="tab"/g)??[]).length,1);
});

// Protect the asynchronous state: keep actual table structure, never announce fake empty results.
test('pending record tables retain headers and page size while hiding empty/count states and disabling actions',async()=>{
 const i18n=i18next.createInstance();await i18n.init({lng:'en',resources:{en:{translation:{loading:'Loading…',selectPage:'Select page',action:'Action',rowsPerPage:'Rows per page',noRecords:'No records',selectedRows:'{{selected}} of {{total}} selected',pageOf:'Page {{page}} of {{pages}}'}}}});
 const html=renderToStaticMarkup(createElement(I18nextProvider,{i18n},createElement(MemoryRouter,null,createElement(RecordDataTable<{id:string}>,{rows:[],columns:[{key:'keyword',label:'Keyword',cell:row=>row.id},{key:'status',label:'Status',cell:()=>''}],hidden:new Set<string>(),total:0,page:1,pageSize:25,sort:{by:'keyword',direction:'asc'},loading:true,onSort:()=>{},onPage:()=>{},onPageSize:()=>{},onOpen:()=>{}}))));
 assert.match(html,/aria-busy="true"/);assert.match(html,/Keyword/);assert.match(html,/Status/);assert.match(html,/Rows per page/);assert.match(html,/>25</);
 assert.match(html,/role="status"/);assert.match(html,/Loading…/);
 assert.doesNotMatch(html,/No records|0 of 0 selected|Page 1 of 1/);
 const buttons=html.match(/<button\b[^>]*>/g)??[];assert.ok(buttons.length>0);assert.ok(buttons.every(button=>/\bdisabled[=\s>]/.test(button)), 'loading table actions stay unavailable');
 assert.equal((html.match(/<th\b/g)??[]).length,4,'selection, actual columns and actions retain their header cells');
 assert.equal((html.match(/<tr\b[^>]*aria-hidden="true"/g)??[]).length,10,'placeholder rows use the record-row height and are hidden from assistive output');
});

import {recordLoadingModel} from '../src/lib/record-loading.js';
import type {ObjectDefinition} from '@xobject/contracts';
const contactLoadingDefinition={contactProfile:{fields:{contact_kind:'kind'},relationships:{},kinds:{organization:'org',individual:'ek',person:'ap'}},fields:[
 {id:'kind',technicalName:'renamed_kind',state:'active'},
 {id:'company',technicalName:'company',state:'active',applicability:{fieldId:'kind',optionIds:['org','ek']}},
 {id:'professional',technicalName:'job',state:'active',applicability:{fieldId:'kind',optionIds:['ap','ek']}},
 {id:'hidden',technicalName:'private',state:'active',fieldPermissions:{read:false}},
],formRelationships:[]} as unknown as ObjectDefinition;
test('Contact loading never guesses a kind or exposes all conditional fields before values arrive',()=>{
 const model=recordLoadingModel(contactLoadingDefinition);assert.equal(model.knownKind,false);assert.deepEqual(model.fields,[]);assert.deepEqual(model.relationships,[]);
});
test('Contact loading uses semantic controller values and read permissions for each kind',()=>{
 const ids=(kind:string)=>recordLoadingModel(contactLoadingDefinition,{renamed_kind:kind}).fields.map(f=>f.id);
 assert.deepEqual(ids('ap'),['kind','professional']);assert.deepEqual(ids('org'),['kind','company']);assert.deepEqual(ids('ek'),['kind','company','professional']);
});

test('known record loading keeps paired group widths and reserves date/time controls for temporal fields',async()=>{
 const i18n=i18next.createInstance();await i18n.init({lng:'en',resources:{en:{translation:{date:'Date',time:'Time'}}}});
 const fields=[{id:'number',technicalName:'record_number',label:'Number',kind:'text',config:{}},{id:'start',technicalName:'start',label:'Start',kind:'structured',config:{schema:'temporal'}}];
 const definition={fields,formRelationships:[],formLayouts:{default:{groups:[{id:'details',labels:{en:'Details'},width:'half',fields:[{fieldId:'number',width:'full'}]},{id:'schedule',labels:{en:'Schedule'},width:'half',fields:[{fieldId:'start',width:'full'}]}]}}} as any;
 const render=(values?:Record<string,any>)=>renderToStaticMarkup(createElement(I18nextProvider,{i18n},createElement(RecordPageLoading,{definition,values})));
 const html=render();
 // Both surfaces must share one two-column grid instead of separate full-width grids.
 assert.match(html,/grid min-w-0 items-start gap-6 md:grid-cols-2/);
 assert.equal((html.match(/data-slot="field-legend"/g)??[]).length,2);
 assert.match(html,/>Date</);assert.match(html,/>Time</);
 const allDay=render({start:{kind:'date',date:'2026-11-05'}});
 assert.doesNotMatch(allDay,/>Time</,'a known all-day value reserves only its date input');
});

test('outer Contact creation fallback uses the known route kind and renders the matching core layout',async()=>{
 const i18n=i18next.createInstance();await i18n.init({lng:'en',resources:{en:{translation:{details:'Details',recordFormActions:'Actions'}}}});
 const definition=structuredClone(contactLoadingDefinition);Object.assign(definition.contactProfile!.fields,{company_name:'company',job_title:'professional'});definition.fields.forEach(field=>{field.label=field.id==='company'?'Company name':field.id==='professional'?'Job title':field.technicalName;field.kind='text';field.config={};});
 const render=(contactKind:string)=>renderToStaticMarkup(createElement(I18nextProvider,{i18n},createElement(RecordPageLoading,{definition,contactKind,isNew:true})));
 const organization=render('org');assert.match(organization,/Company name/);assert.doesNotMatch(organization,/Job title/);assert.match(organization,/xl:grid-cols-3/);
 const person=render('ap');assert.match(person,/Job title/);assert.doesNotMatch(person,/Company name/);
});

test('classification controls in a conversion dialog keep distinct labels beside the record form',async()=>{
 const {ClassificationFields}=await import('../src/components/classification-values.js');
 const config:import('@xobject/contracts').ClassificationConfig={version:1,type:{required:false,defaultId:null},status:{required:false,defaults:[]},category:{required:false,multiple:false,defaultIds:[]},options:[]};
 const field:import('@xobject/contracts').FieldDefinition={id:'classification-field',technicalName:'type',labels:{en:'Type'},label:'Type',kind:'type',required:false,config:{},version:1,description:'Choose a Type',helpText:'Optional classification'};
 const i18n=i18next.createInstance();await i18n.init({lng:'en',resources:{en:{translation:{classificationType:'Type',noSelection:'No selection'}}}});
 const props={config,fields:[field],value:{type:null,status:null,category:[]},onChange:()=>{},disabled:false};
 const html=renderToStaticMarkup(createElement(I18nextProvider,{i18n},createElement('div',null,createElement(ClassificationFields,props),createElement(ClassificationFields,{...props,idPrefix:'conversion-organization-'}))));
 assert.ok(html.includes('id="record-type"'));assert.ok(html.includes('id="conversion-organization-record-type"'));assert.ok(html.includes('for="conversion-organization-record-type"'));
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);assert.equal(new Set(ids).size,ids.length);
});
