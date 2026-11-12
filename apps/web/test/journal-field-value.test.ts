import {test} from 'node:test';
import assert from 'node:assert/strict';
import i18next from 'i18next';
import {defaultRegionalSettings,type JournalEntry} from '@xobject/contracts';
import {journalFieldValue} from '../src/lib/journal-field-value';
test('all journal surfaces format structured historical names and yearless birthdays without technical property counts',async()=>{
 const i18n=i18next.createInstance();await i18n.init({lng:'en',resources:{en:{translation:{journalNotSet:'Not set'}}}});
 const entry={value_context:{before:{kind:'structured',config:{schema:'name_components'}},after:{kind:'structured',config:{schema:'name_components'}}}} as JournalEntry;
 const id='019da41b-2082-79e3-9bcc-7700db769817';
 assert.equal(journalFieldValue(entry,[{id,text:'Marie'},{id:'019da41b-2082-79e3-9bcc-7700db769818',text:'Emily'}],'before','en',i18n.t,'Europe/Berlin',defaultRegionalSettings),'Marie; Emily');
 assert.equal(journalFieldValue(entry,[{id,text:'Emily'}],'after','en',i18n.t,'Europe/Berlin',defaultRegionalSettings),'Emily');
 const birthday={value_context:{after:{kind:'structured',config:{schema:'partial_date'}}}} as JournalEntry;
 const value={month:2,day:29,year:null};
 assert.equal(journalFieldValue(birthday,value,'after','en',i18n.t,'America/New_York',defaultRegionalSettings),'February 29');
 assert.equal(journalFieldValue(birthday,value,'after','de',i18n.t,'Europe/Berlin',{...defaultRegionalSettings,locale:'de-DE'}),'29. Februar');
 assert.equal(journalFieldValue(entry,null,'after','en',i18n.t,'UTC',defaultRegionalSettings),'Not set');
 assert.equal(journalFieldValue(entry,{invalid:true},'after','en',i18n.t,'UTC',defaultRegionalSettings),undefined);
 assert.deepEqual(value,{month:2,day:29,year:null});
});

test('Contact inheritance history distinguishes own empty, own text and inherited mode',async()=>{
 const i18n=i18next.createInstance();await i18n.init({lng:'en',resources:{en:{translation:{contactInherit:'Inherit from Organization',contactOwn:'Own value',journalNotSet:'Not set'}}}});
 const entry={value_context:{after:{kind:'text',config:{}}}} as JournalEntry;
 assert.equal(journalFieldValue(entry,{mode:'inherit'},'after','en',i18n.t,'UTC',defaultRegionalSettings),'Inherit from Organization');
 assert.equal(journalFieldValue(entry,{mode:'own',value:null},'after','en',i18n.t,'UTC',defaultRegionalSettings),'Own value · Not set');
 assert.equal(journalFieldValue(entry,{mode:'own',value:'Branch office'},'after','en',i18n.t,'UTC',defaultRegionalSettings),'Own value · Branch office');
});


test('structured own exceptions use the captured context and readable telephone presentation',async()=>{
 const i18n=i18next.createInstance();await i18n.init({lng:'en',resources:{en:{translation:{contactOwn:'Own value',journalNotSet:'Not set'}}}});
 const entry={value_context:{after:{kind:'structured',config:{schema:'phone_entries',options:[{id:'019da41b-2082-79e3-9bcc-7700db769818',labels:{en:'Reception'},active:true}]}}}} as JournalEntry;
 const value={mode:'own',value:[{id:'019da41b-2082-79e3-9bcc-7700db769817',value:'+12025550123',contexts:['019da41b-2082-79e3-9bcc-7700db769818'],preference:1}]};
 assert.equal(journalFieldValue(entry,value,'after','en',i18n.t,'UTC',defaultRegionalSettings),'Own value · +1 202 555 0123 (Reception)');
});
