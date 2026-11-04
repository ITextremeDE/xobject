import test from 'node:test';
import assert from 'node:assert/strict';
import {type RelationshipField,type RecordLinkOption,oppositeRelationshipSide} from '@xobject/contracts';
import {linkMenuGroups,seedLinkedFields,type LinkedCreation} from '../src/lib/linked-record';
const general={id:'general',kind:'general',directed:false,allowAll:true,pairs:[],labels:{de:'Allgemeine Verknüpfung'},leftLabels:{de:'Verknüpfte Datensätze'}};
const custom={...general,id:'coverage',kind:'custom',directed:true,allowAll:false,pairs:[{leftObjectTypeId:'contract',rightObjectTypeId:'device'}],leftLabels:{de:'Wartungsverträge'},rightLabels:{de:'Abgedeckte Geräte'}};
test('link menu flattens General-only objects and retains exact localized side labels for specific choices',()=>{
 const fields=[{definition:general,side:'left',targets:[]},{definition:custom,side:'right',targets:[]}] as unknown as RelationshipField[];
 const options=[{objectType:{id:'site',technicalName:'sites',labels:{de:'Standorte'}},relationships:[{relationshipTypeId:'general',side:'left',canCreate:true}]},{objectType:{id:'device',technicalName:'devices',labels:{de:'Geräte'}},relationships:[{relationshipTypeId:'coverage',side:'right',canCreate:false},{relationshipTypeId:'general',side:'left',canCreate:true}]}] as RecordLinkOption[];
 const groups=linkMenuGroups(options,fields,'de');assert.equal(groups[0].label,'Geräte');assert.deepEqual(groups[0].choices.map(c=>c.label),['Allgemeine Verknüpfung','Abgedeckte Geräte']);assert.equal(groups[0].choices[1].canCreate,false);assert.equal(groups[1].choices.length,1);assert.equal(groups[1].choices[0].field.definition.kind,'general');
 assert.equal(oppositeRelationshipSide(fields[0].definition,'left'),'left');assert.equal(oppositeRelationshipSide(fields[1].definition,'right'),'left');
});
test('linked drafts seed only the selected inverse relationship without changing the server baseline',()=>{
 const fields=[{definition:general,side:'left',targets:[]},{definition:custom,side:'left',targets:[]}] as unknown as RelationshipField[];
 const context={linkFrom:{relationshipTypeId:'coverage',side:'right'},source:{objectTypeId:'contract',recordId:'source'}} as LinkedCreation;
 const seeded=seedLinkedFields(fields,context);assert.deepEqual(seeded[1].targets,[context.source]);assert.equal(seeded[0],fields[0]);assert.deepEqual(fields[1].targets,[]);assert.equal(seedLinkedFields(fields),fields);
});
