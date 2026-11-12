import React from 'react';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {createInstance} from 'i18next';
import {I18nextProvider} from 'react-i18next';
import {emptyClassification,type FieldDefinition,type RelationshipField} from '@xobject/contracts';
import {ContactSummaryGroup} from '../src/components/contact-summary-group';
import {CombinedRelationshipList} from '../src/components/combined-relationship-list';
import {displayClassification} from '../src/components/classification-values';
const i18n=createInstance();await i18n.init({lng:'de',resources:{de:{translation:{}}},initImmediate:false});
const render=(element:React.ReactNode)=>renderToStaticMarkup(<I18nextProvider i18n={i18n}><QueryClientProvider client={new QueryClient()}><MemoryRouter>{element}</MemoryRouter></QueryClientProvider></I18nextProvider>);
const config={...emptyClassification(),category:{required:false,multiple:true,tree:true,defaultIds:[]},options:[{id:'type-id',kind:'type' as const,active:true,typeId:null,labels:{de:'Firma'}},{id:'parent',kind:'category' as const,active:true,typeId:null,labels:{de:'Berater'}},{id:'child',kind:'category' as const,active:true,typeId:null,parentId:'parent',labels:{de:'Rechtsanwalt'}}]};
test('Contact read projection resolves classification dictionaries and shows an unambiguous category path',()=>{
 const field={id:'field-id',kind:'type',technicalName:'type',label:'Typ',config:{}} as FieldDefinition;
 const html=render(<ContactSummaryGroup group={{id:'classification',labels:{de:'Einordnung'},fields:[{fieldId:field.id,width:'half'}]}} fields={[field]} classification={config} values={{type:'type-id'}} workspaceCode="qa"/>);
 assert.match(html,/Firma/);assert.doesNotMatch(html,/>type-id</);
 assert.equal(displayClassification(config,'category',['parent','child']),'Berater › Rechtsanwalt');
});
test('same directed relationship on two sides has unique search IDs and individually named labels',()=>{
 const definition={id:'relation',active:true,leftMin:0,rightMin:0,leftLabels:{de:'Kinder'},rightLabels:{de:'Eltern'},pairs:[],kind:'custom',fields:[]} as unknown as RelationshipField['definition'];
 const fields=['left','right'].map(side=>({definition,side,targets:[]})) as RelationshipField[];
 const list=(side:'left'|'right',title:string)=><CombinedRelationshipList title={title} single entries={[{relationshipTypeId:definition.id,side,width:'full'}]} fields={fields} fieldDefinitions={[]} values={{}} workspaceId="workspace" objectTypeId="object" workspaceCode="qa" disabled={false} readOnly onChange={()=>{}} onPickerDirtyChange={()=>{}}/>;
 const html=render(<>{list('left','Kinder')}{list('right','Eltern')}</>),ids=[...html.matchAll(/id="([^"]+-search)"/g)].map(m=>m[1]);
 assert.equal(ids.length,2);assert.equal(new Set(ids).size,2);
});
