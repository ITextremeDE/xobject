import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router';
import i18next from 'i18next';
import {I18nextProvider} from 'react-i18next';
import {RecordDataTable} from '../src/components/record-data-table.js';

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
