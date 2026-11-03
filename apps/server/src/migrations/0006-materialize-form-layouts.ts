import {sql} from 'kysely';
import {isDeepStrictEqual} from 'node:util';
import type {Executor} from '../database.js';

// Frozen v5 presentation rules: preserve existing implicit layouts before removing semantic group IDs.
// Do not call the evolving runtime layout resolver from this numbered upgrade.
type Entry={fieldId?:string;relationshipTypeId?:string;side?:'left'|'right';primary?:true;width:'half'|'full';visible?:boolean;expanded?:'auto'|'open'|'closed'};
type Layout={unassigned?:Entry[];groups:{id:string;labels:Record<string,string>;fields:Entry[]}[]};
type Relation={id:string;kind:string;active:boolean;directed:boolean;allow_all:boolean;left_max:1|null;right_max:1|null};
const key=(entry:Entry)=>entry.fieldId??(entry.primary?'primary_chain':`relationship:${entry.relationshipTypeId}:${entry.side}`);
export async function materializeLegacyFormLayouts(tx:Executor){
  const objects=(await sql<{id:string;workspace_id:string;form_layouts:Record<string,Layout>}>`SELECT id,workspace_id,form_layouts FROM sys_object_types WHERE state<>'deleted' ORDER BY id`.execute(tx)).rows;
  for(const object of objects){
    const layout:Layout=object.form_layouts.default?structuredClone(object.form_layouts.default):{groups:[
      {id:'general',labels:{de:'Allgemein',en:'General'},fields:[]},
      {id:'business',labels:{de:'Fachliche Angaben',en:'Business details'},fields:[]},
    ]};
    if(!layout.groups.length)continue; // A zero-group layout is already an explicit newer configuration.
    const included=new Set([...layout.groups.flatMap(group=>group.fields),...(layout.unassigned??[])].map(key));
    const fields=(await sql<{id:string;technical_name:string;kind:string}>`SELECT id,technical_name,kind FROM sys_fields WHERE object_type_id=${object.id}::uuid AND state<>'deleted' ORDER BY id`.execute(tx)).rows;
    const rank=['keyword','type','status','category'];
    if(!object.form_layouts.default)fields.sort((a,b)=>(rank.indexOf(a.technical_name)<0?4:rank.indexOf(a.technical_name))-(rank.indexOf(b.technical_name)<0?4:rank.indexOf(b.technical_name)));
    for(const field of fields){if(included.has(field.id))continue;
      const group=layout.groups.find(group=>group.id===(rank.includes(field.technical_name)?'general':'business'))??layout.groups[layout.groups.length-1];
      group.fields.push({fieldId:field.id,width:['keyword','category'].includes(field.technical_name)||['multiline','multiple_choice'].includes(field.kind)?'full':'half'});
    }
    const relations=(await sql<Relation>`SELECT id,kind,active,directed,allow_all,left_max,right_max FROM sys_relationship_types WHERE workspace_id=${object.workspace_id}::uuid AND kind<>'general' AND rules_state='active' ORDER BY kind,technical_name`.execute(tx)).rows;
    const roles=(await sql<{role:string;object_type_id:string}>`SELECT role,object_type_id FROM sys_primary_chain_levels WHERE workspace_id=${object.workspace_id}::uuid`.execute(tx)).rows;
    for(const relation of relations){
      if(relation.kind==='primary'&&(!relation.active||(roles.length===3&&roles.find(role=>role.role==='contact')?.object_type_id===object.id)))continue;
      const pairs=(await sql<{left_object_type_id:string;right_object_type_id:string}>`SELECT left_object_type_id,right_object_type_id FROM sys_relationship_type_pairs WHERE relationship_type_id=${relation.id}::uuid`.execute(tx)).rows;
      const symmetric=!relation.directed&&(relation.allow_all||pairs.some(pair=>pairs.some(other=>other.left_object_type_id===pair.right_object_type_id)));
      for(const side of ['left','right'] as const){
        if((side==='right'&&symmetric)||(relation.kind==='primary'&&side==='left'))continue;
        const eligible=relation.allow_all||pairs.some(pair=>(side==='left'?pair.left_object_type_id:pair.right_object_type_id)===object.id)||(symmetric&&pairs.some(pair=>pair.right_object_type_id===object.id));
        if(!eligible)continue;
        const entry:Entry=relation.kind==='primary'?{primary:true,width:'full',visible:true}:{relationshipTypeId:relation.id,side,width:(side==='left'?relation.left_max:relation.right_max)===1?'half':'full',visible:true,expanded:'auto'};
        if(included.has(key(entry)))continue;
        let group=layout.groups.find(group=>group.id==='relationships');
        if(!group){group={id:'relationships',labels:{de:'Verknüpfungen',en:'Relationships'},fields:[]};layout.groups.push(group);}
        group.fields.push(entry);included.add(key(entry));
      }
    }
    if(!isDeepStrictEqual(object.form_layouts.default,layout))await sql`UPDATE sys_object_types SET form_layouts=jsonb_set(form_layouts,'{default}',${JSON.stringify(layout)}::jsonb),version=version+1 WHERE id=${object.id}::uuid`.execute(tx);
  }
}
