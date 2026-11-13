import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {api} from './api';
import {removedRelationshipTargets} from './relationship-selection';
import type {RelationshipField,DossierEntry,Inputs} from '@xobject/contracts';

/** Persisted pages stay separate from sparse local edge edits. Pending additions are pinned first. */
export function useRelationshipPage<T>(fields:RelationshipField[],objectTypeId:string,recordId:string|undefined,search:string,sort:{by:string;direction:'asc'|'desc'},pending:T[],project:(entry:DossierEntry)=>T){
 const [page,setPage]=useState(1),[pageSize,setPageSize]=useState(10);
 const entries=fields.map(f=>({relationshipTypeId:f.definition.id,side:f.side}));
 const exclude=fields.flatMap(f=>removedRelationshipTargets(f).map(ref=>({...ref,relationshipTypeId:f.definition.id,side:f.side})));
 const enabled=Boolean(recordId&&fields.some(f=>f.paged));
 const local=pending.slice((page-1)*pageSize,page*pageSize),offset=Math.max(0,(page-1)*pageSize-pending.length),limit=Math.max(1,pageSize-local.length);
 const query=useQuery({queryKey:['relationship-page',objectTypeId,recordId,entries,exclude,search,sort,page,pageSize,pending.length],queryFn:()=>api('get_record_relationship_page',{objectTypeId,recordId:recordId!,entries,exclude,query:search,sortBy:sort.by as Inputs['get_record_relationship_page']['sortBy'],sortDirection:sort.direction,offset,limit}),enabled});
 const total=(query.data?.total??0)+pending.length;
 useEffect(()=>{if(query.data)setPage(current=>Math.min(current,Math.max(1,Math.ceil(total/pageSize))));},[query.data,total,pageSize]);
 const rows=[...local,...(local.length<pageSize?(query.data?.entries??[]).map(project):[])];
 return {enabled,query,pagination:{rows,total,page,pageSize,onPage:setPage,onPageSize:(size:number)=>{setPageSize(size);setPage(1);}},resetPage:()=>setPage(1)};
}
