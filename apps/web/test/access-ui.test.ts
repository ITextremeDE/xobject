import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import i18next from 'i18next';
import {I18nextProvider} from 'react-i18next';
import {ApiCredentialTable} from '../src/components/api-credentials.js';
import {JournalEntryDetails} from '../src/components/journal-entry-details.js';
import {TimeZoneProvider} from '../src/lib/time-zone-context.js';
import {journalEntryTitle,journalCredentialValue} from '../src/lib/journal-presentation.js';
async function translation(){const i18n=i18next.createInstance();await i18n.init({lng:'en',resources:{en:{translation:{journalTokenCreated:'Access token created',journalTokenRevoked:'Access token revoked',journalSessionRevoked:'Session signed out',definition_active:'Active',tokenRevoked:'Revoked',objectName:'Name',tokenOwner:'Account',tokenChannels:'Allowed channels',tokenAccess:'Access',tokenReadOnly:'Read-only',tokenUserRights:'Current user permissions',tokenExpires:'Expires',before:'Before',after:'After',journalNotSet:'Not set',noTokens:'No tokens',revokeNamedToken:'Revoke {{name}}'}}}});return i18n;}
test('token journal labels remain distinct from session events and technical names',async()=>{
 const i18n=await translation(),entry={entity_kind:'api_credential',field_key:'revoked',old_value:false,new_value:true};
 assert.equal(journalEntryTitle(entry,i18n.t),'Access token revoked');assert.equal(journalEntryTitle({...entry,entity_kind:'session'},i18n.t),'Session signed out');
 assert.equal(journalEntryTitle({...entry,field_key:'created'},i18n.t),'Access token created');assert.equal(journalCredentialValue(entry,false,i18n.t),'Active');assert.equal(journalCredentialValue(entry,true,i18n.t),'Revoked');
 assert.equal(journalCredentialValue({...entry,field_key:'created'},{name:'External agent'},i18n.t),'External agent');assert.equal(journalCredentialValue({...entry,entity_kind:'record'},true,i18n.t),undefined);
});
test('token journal details show named ownership, channel restrictions and regional expiry without raw property names',async()=>{
 const i18n=await translation(),entry={entity_kind:'api_credential',field_key:'created',entity_id:'credential',actor_id:'actor',actor_name:'John Doe',workspace_id:null,workspace_name:null,entity_name:'External agent · John Doe',id:'event',change_id:'change',field_id:null,created_at:'2026-11-05T12:00:00Z',old_value:null,new_value:{name:'External agent',userId:'owner-id',channels:['api','mcp'],readOnly:true,expiresAt:'2026-11-06T19:00:00Z'},credential_context:{name:'External agent',userId:'owner-id',userName:'John Doe'}};
 const html=renderToStaticMarkup(createElement(I18nextProvider,{i18n},createElement(TimeZoneProvider,{value:'Europe/Berlin'},createElement(JournalEntryDetails,{entry}))));
 assert.match(html,/John Doe/);assert.match(html,/Allowed channels/);assert.match(html,/REST API, MCP/);assert.match(html,/Read-only/);assert.match(html,/Nov 6, 2026/);assert.match(html,/8:00/);assert.doesNotMatch(html,/>userId<|>channels<|>readOnly<|>expiresAt<|2026-11-06T19:00:00Z/);
});
test('pending token tables retain real headers, hide empty results and keep accessible named actions',async()=>{
 const i18n=await translation(),render=(props:Parameters<typeof ApiCredentialTable>[0])=>renderToStaticMarkup(createElement(I18nextProvider,{i18n},createElement(ApiCredentialTable,props)));
 const pending=render({rows:[],loading:true,onRevoke:()=>{}});assert.match(pending,/aria-busy="true"/);assert.doesNotMatch(pending,/No tokens/);assert.equal((pending.match(/<tr\b[^>]*aria-hidden="true"/g)??[]).length,3);
 const content=render({rows:[{id:'token',userId:'owner',name:'A long external application name',channels:['api','mcp'],readOnly:true,createdAt:'2026-11-05T12:00:00Z',expiresAt:'2027-01-01T00:00:00Z',lastUsedAt:null,revokedAt:null}],onRevoke:()=>{}});assert.match(content,/aria-label="Revoke A long external application name"/);assert.match(content,/A long external application name/);assert.match(content,/Read-only/);
});
