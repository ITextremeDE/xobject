import {tableName} from './definition-metadata.js';
import {contactRelationshipListLayout} from '@xobject/contracts';
import {upgradeContactAffiliations} from './contact-affiliation-upgrade.js';
import {activityObjectKeys} from './activity.js';
import {workFormLayout} from '@xobject/contracts';
import {workProfile} from './work-domain.js';
import {contactProfile} from './contact-domain.js';
import {withContentAccess,contentAccess,setObjectSensitivity} from './content-permissions.js';
import {formRelationshipFields,resolveFormLayout} from '@xobject/contracts';
import {primaryChain} from './primary-chain.js';
import {activateRelationship} from './record-relationships.js';
import {relationshipTypes,configureRelationship} from './relationship-types.js';
import {sql} from 'kysely';
import {v7} from 'uuid';
import {isDeepStrictEqual} from 'node:util';
import {AppError} from './errors.js';
import {type FieldConfig} from '@xobject/contracts';
import type {Executor} from './database.js';
import {ObjectDefinitions} from './object-definitions.js';
import type {JournalWriter} from './domain-types.js';

/** Install template contributions once, preserving workspace-authored definitions and common forms. */
export class ModuleInstallation {
  constructor(private definitions:ObjectDefinitions,private journal:JournalWriter){}
  async refreshInstalledModuleTemplates(tx:Executor){
    const installed=(await sql<{workspace_id:string;module_key:string}>`SELECT DISTINCT workspace_id,module_key FROM sys_module_contributions WHERE module_key IN ('contacts','projects') ORDER BY workspace_id,module_key`.execute(tx)).rows;
    if(!installed.length)return;
    const actor=(await sql<{id:string}>`SELECT id FROM sys_users WHERE is_admin AND active ORDER BY created_at,id LIMIT 1`.execute(tx)).rows[0]?.id;
    if(!actor)throw new AppError(409,'Module upgrade requires an active Administrator');
    await withContentAccess(tx,actor,async()=>{
      await sql`SELECT set_config('xobject.actor_id',${actor},true),set_config('xobject.channel','internal',true)`.execute(tx);
      // Inactive definitions stay inactive. Temporary transaction-local activation permits the
      // shared installer to validate and add definitions without exposing a partial model.
      const inactive=(await sql<{id:string}>`SELECT id FROM sys_object_types WHERE state='inactive'`.execute(tx)).rows.map(row=>row.id);
      if(inactive.length)await sql`UPDATE sys_object_types SET state='active' WHERE id=ANY(${inactive}::uuid[])`.execute(tx);
      for(const module of installed)await this.installModuleObjects(tx,module.workspace_id,actor,module.module_key);
      await upgradeContactAffiliations(tx,actor);
      if(inactive.length)await sql`UPDATE sys_object_types SET state='inactive' WHERE id=ANY(${inactive}::uuid[])`.execute(tx);
    });
  }

  async installModuleObjects(tx:Executor,workspaceId:string,actor:string,moduleKey="projects") {
    if(moduleKey==='projects')await this.installModuleObjects(tx,workspaceId,actor,'contacts');
    const catalog=(await sql<{template_version:number;objects:{key:string;technicalName:string;labels:Record<string,string>;standardFields:('keyword'|'type_status'|'category'|'tags')[];fields?:{key:string;technicalName:string;labels:Record<string,string>;kind:import('@xobject/contracts').CustomFieldKind;config?:FieldConfig;required?:boolean;derived?:boolean;appliesTo?:string[];choices?:{key:string;labels:Record<string,string>;group?:'usage'|'phone_type'}[]}[]}[]}>`SELECT template_version,objects FROM sys_modules WHERE key=${moduleKey}`.execute(tx)).rows[0];
    const levels:Record<string,string>={},freshObjects=new Set<string>();
    for(const proposal of catalog.objects){
      let binding=(await sql<{object_type_id:string}>`SELECT object_type_id FROM sys_module_object_bindings WHERE workspace_id=${workspaceId}::uuid AND object_key=${proposal.key}`.execute(tx)).rows[0];
      if(!binding){
        if((await sql`SELECT 1 FROM sys_object_types WHERE workspace_id=${workspaceId}::uuid AND technical_name=${proposal.technicalName} AND state<>'deleted'`.execute(tx)).rows.length)throw new AppError(409,'Module object name conflicts with an existing custom object',{code:"moduleObjectNameConflict"});
        const created=await this.definitions.createObjectType(tx,{workspaceId,technicalName:proposal.technicalName,labels:proposal.labels,standardFields:proposal.standardFields},actor,true);
        binding={object_type_id:created.id};freshObjects.add(created.id);
        await sql`INSERT INTO sys_module_object_bindings VALUES(${workspaceId}::uuid,${proposal.key},${created.id}::uuid)`.execute(tx);
        await sql`UPDATE sys_object_types SET is_protected=true WHERE id=${created.id}::uuid`.execute(tx);
        await sql`UPDATE sys_fields SET is_protected=true WHERE object_type_id=${created.id}::uuid`.execute(tx);
        const change=v7();
        await this.journal(tx,actor,workspaceId,created.id,'object_type',created.id,change,'module_binding',null,proposal.key);
        await this.journal(tx,actor,workspaceId,created.id,'object_type',created.id,change,'is_protected',false,true);
        const suppliedFields=(await sql<{id:string}>`SELECT id FROM sys_fields WHERE object_type_id=${created.id}::uuid`.execute(tx)).rows;
        for(const field of suppliedFields)await this.journal(tx,actor,workspaceId,created.id,'field',field.id,change,'is_protected',false,true,field.id);
      }
      if(activityObjectKeys.includes(proposal.key)){
        const current=(await sql<{is_sensitive:boolean}>`SELECT is_sensitive FROM sys_object_types WHERE id=${binding.object_type_id}::uuid`.execute(tx)).rows[0];
        if(!current.is_sensitive){const change=v7();await setObjectSensitivity(tx,binding.object_type_id,false,true,(key,before,after,field)=>this.journal(tx,actor,workspaceId,binding.object_type_id,'object_permissions',binding.object_type_id,change,key,before,after,field));await sql`UPDATE sys_object_types SET is_sensitive=true,permissions_version=permissions_version+1,version=version+1 WHERE id=${binding.object_type_id}::uuid`.execute(tx);contentAccess().clear();}
      }
      let type=await this.definitions.objectType(tx,binding.object_type_id);if(type.state==='deleted')throw new AppError(409,'Module definition has been deleted');
      if(type.state==='inactive'){await sql`UPDATE sys_object_types SET state='active',version=version+1 WHERE id=${type.id}::uuid`.execute(tx);await this.journal(tx,actor,workspaceId,type.id,'object_type',type.id,v7(),'state','inactive','active');type=await this.definitions.objectType(tx,type.id);}
      const previousContribution=(await sql<{template_version:number}>`SELECT template_version FROM sys_module_contributions WHERE workspace_id=${workspaceId}::uuid AND module_key=${moduleKey} AND object_type_id=${type.id}::uuid`.execute(tx)).rows[0];
      if((await sql`INSERT INTO sys_module_contributions VALUES(${workspaceId}::uuid,${moduleKey},${type.id}::uuid,${catalog.template_version}) ON CONFLICT DO NOTHING RETURNING object_type_id`.execute(tx)).rows.length)await this.journal(tx,actor,workspaceId,type.id,'object_type',type.id,v7(),`module.${moduleKey}.contribution`,null,{version:catalog.template_version});
      {
        for(const blueprint of proposal.fields??[]){
          const retained=(await sql<{id:string;kind:string;technical_name:string;value_mode:string;config:FieldConfig;version:number;required:boolean;option_keys:Record<string,string>}>`SELECT f.id,f.kind,f.technical_name,f.value_mode,f.config,f.version,f.required,b.option_keys FROM sys_module_field_bindings b JOIN sys_fields f ON f.id=b.field_id WHERE b.workspace_id=${workspaceId}::uuid AND b.object_key=${proposal.key} AND b.field_key=${blueprint.key}`.execute(tx)).rows[0];
          if(retained){if(retained.kind!==blueprint.kind||retained.technical_name!==blueprint.technicalName||retained.value_mode!==(blueprint.derived?'derived':'stored')||Object.entries(blueprint.config??{}).some(([key,value])=>!['options','components'].includes(key)&&!isDeepStrictEqual(retained.config[key as keyof FieldConfig],value)))throw new AppError(409,'Conflicting shared module field structure');
            const missing=(blueprint.choices??[]).filter(choice=>!retained.option_keys[choice.key]);
            if(missing.length){const added=missing.map(choice=>({id:v7(),labels:choice.labels,active:true,...choice.group?{group:choice.group}:{}}));
              await this.definitions.configureField(tx,{fieldId:retained.id,required:retained.required,config:{...retained.config,options:[...(retained.config.options??[]),...added]}},actor);
              const keys={...retained.option_keys,...Object.fromEntries(missing.map((choice,index)=>[choice.key,added[index].id]))};
              await sql`UPDATE sys_module_field_bindings SET option_keys=${JSON.stringify(keys)}::jsonb WHERE field_id=${retained.id}::uuid`.execute(tx);
            }continue;}
          const options=(blueprint.choices??[]).map(choice=>({id:v7(),key:choice.key,labels:choice.labels,active:true,...(choice.group?{group:choice.group}:{})}));
          const kindBinding=(await sql<{field_id:string;option_keys:Record<string,string>}>`SELECT field_id,option_keys FROM sys_module_field_bindings WHERE workspace_id=${workspaceId}::uuid AND object_key=${proposal.key} AND field_key='contact_kind'`.execute(tx)).rows[0];
          const created=await this.definitions.createField(tx,{objectTypeId:binding.object_type_id,technicalName:blueprint.technicalName,labels:blueprint.labels,kind:blueprint.kind,required:blueprint.required??false,config:blueprint.choices?{...blueprint.config,...(blueprint.kind==='single_choice'||blueprint.kind==='multiple_choice'?{fixedOptions:blueprint.key==='contact_kind'}:{}),options:options.map(({key,...option})=>option)}:blueprint.config,applicability:blueprint.appliesTo&&kindBinding?{fieldId:kindBinding.field_id,optionIds:blueprint.appliesTo.map(key=>kindBinding.option_keys[key])}:undefined},actor) as {id:string};
          await sql`INSERT INTO sys_module_field_bindings VALUES(${workspaceId}::uuid,${proposal.key},${blueprint.key},${created.id}::uuid,${JSON.stringify(Object.fromEntries(options.map(o=>[o.key,o.id])))}::jsonb)`.execute(tx);
          await sql`UPDATE sys_fields SET is_protected=true,value_mode=${blueprint.derived?'derived':'stored'} WHERE id=${created.id}::uuid`.execute(tx);
          if(blueprint.derived)await sql`ALTER TABLE ${sql.table(tableName(type))} DROP COLUMN ${sql.ref(blueprint.technicalName)}`.execute(tx);
          const change=v7();await this.journal(tx,actor,workspaceId,type.id,'field',created.id,change,'is_protected',false,true,created.id);
          if(blueprint.derived)await this.journal(tx,actor,workspaceId,type.id,'field',created.id,change,'value_mode','stored','derived',created.id);
        }
        if(proposal.key==='contact'&&!(await sql`SELECT 1 FROM sys_module_field_bindings WHERE workspace_id=${workspaceId}::uuid AND object_key='contact' AND field_key='keyword'`.execute(tx)).rows.length){
          const keyword=(await sql<{id:string}>`SELECT id FROM sys_fields WHERE object_type_id=${type.id}::uuid AND technical_name='keyword'`.execute(tx)).rows[0];
          await sql`INSERT INTO sys_module_field_bindings VALUES(${workspaceId}::uuid,'contact','keyword',${keyword.id}::uuid,'{}')`.execute(tx);
          await sql`UPDATE sys_fields SET value_mode='derived',required=true WHERE id=${keyword.id}::uuid`.execute(tx);
          await sql`ALTER TABLE ${sql.table(tableName(type))} DROP COLUMN keyword`.execute(tx);
          await this.journal(tx,actor,workspaceId,type.id,'field',keyword.id,v7(),'value_mode','stored','derived',keyword.id);
        }
      }
      if(freshObjects.has(type.id)&&['project','case','task'].includes(proposal.key)){
        const meanings=['open','in_progress','done','canceled'] as const,english=['Open','In progress','Done','Canceled'],german=['Offen','In Arbeit','Erledigt','Abgebrochen'];
        await this.definitions.configureClassification(tx,{objectTypeId:type.id,version:type.classification.version,config:{type:{required:false,defaultId:null},status:{required:false,defaults:[]},category:{required:false,multiple:true,defaultIds:[]},options:meanings.map((meaning,index)=>({id:v7(),kind:'status' as const,typeId:null,active:true,labels:{en:english[index],de:german[index]},...(proposal.key==='task'?{meaning}:{})}))}},actor);
      }
      if(proposal.standardFields.includes('tags')&&previousContribution&&previousContribution.template_version<catalog.template_version&&!(await sql`SELECT 1 FROM sys_fields WHERE object_type_id=${type.id}::uuid AND technical_name='tags'`.execute(tx)).rows.length){
        await this.definitions.addStandardField(tx,type,'tags',actor);
        const added=(await sql<{id:string}>`SELECT id FROM sys_fields WHERE object_type_id=${type.id}::uuid AND technical_name='tags' AND state='active'`.execute(tx)).rows[0];
        await sql`UPDATE sys_fields SET is_protected=true WHERE id=${added.id}::uuid`.execute(tx);
        await this.journal(tx,actor,workspaceId,type.id,'field',added.id,v7(),'is_protected',false,true,added.id);
      }
      const suppliedNames=[...proposal.standardFields.flatMap(name=>name==='type_status'?['type','status']:[name]),...(proposal.fields??[]).map(f=>f.technicalName),...(proposal.key==='contact'?(await sql<{objects:{key:string;fields:{technicalName:string}[]}[]}>`SELECT objects FROM sys_modules WHERE key='contacts'`.execute(tx)).rows[0].objects.find(o=>o.key==='contact')!.fields.map(f=>f.technicalName):[])];
      const contributed=(await sql<{field_id:string}>`INSERT INTO sys_module_field_contributions SELECT ${workspaceId}::uuid,${moduleKey},${type.id}::uuid,f.id FROM sys_fields f WHERE f.object_type_id=${type.id}::uuid AND f.technical_name=ANY(${suppliedNames}::text[]) ON CONFLICT DO NOTHING RETURNING field_id`.execute(tx)).rows;
      for(const field of contributed)await this.journal(tx,actor,workspaceId,type.id,'field',field.field_id,v7(),`module.${moduleKey}.contribution`,null,true,field.field_id);
      await sql`UPDATE sys_module_contributions SET template_version=${catalog.template_version} WHERE workspace_id=${workspaceId}::uuid AND module_key=${moduleKey} AND object_type_id=${type.id}::uuid`.execute(tx);
      levels[proposal.key]=binding.object_type_id;
    }
    if(moduleKey==='contacts'){
      const kind=(await sql<{field_id:string;option_keys:Record<string,string>}>`SELECT field_id,option_keys FROM sys_module_field_bindings WHERE workspace_id=${workspaceId}::uuid AND object_key='contact' AND field_key='contact_kind'`.execute(tx)).rows[0];
      for(const blueprint of [
        {key:'contact_person',left:levels.contact,right:levels.contact,directed:true,leftMax:null,rightMax:1,labels:{en:'Organization membership',de:'Organisationszugehörigkeit'},leftLabels:{en:'Contact persons',de:'Ansprechpartner'},rightLabels:{en:'Organization',de:'Organisation'},leftOptions:[kind.option_keys.organization],rightOptions:[kind.option_keys.person]},
        {key:'contact_identity',left:levels.contact,right:levels.contact,directed:false,leftMax:null,rightMax:null,labels:{en:'Identities',de:'Identitäten'},leftLabels:{en:'Identities',de:'Identitäten'},rightLabels:{en:'Identities',de:'Identitäten'},leftOptions:[kind.option_keys.individual,kind.option_keys.person],rightOptions:[kind.option_keys.individual,kind.option_keys.person]},
        {key:'contact_parent',left:levels.contact,right:levels.contact,directed:true,leftMax:null,rightMax:null,labels:{en:'Parenthood',de:'Elternschaft'},leftLabels:{en:'Children',de:'Kinder'},rightLabels:{en:'Parents',de:'Eltern'},leftOptions:[kind.option_keys.individual,kind.option_keys.person],rightOptions:[kind.option_keys.individual,kind.option_keys.person]},
        {key:'contact_partner',left:levels.contact,right:levels.contact,directed:false,leftMax:null,rightMax:null,labels:{en:'Partnership',de:'Partnerschaft'},leftLabels:{en:'Partners',de:'Partner'},rightLabels:{en:'Partners',de:'Partner'},leftOptions:[kind.option_keys.individual,kind.option_keys.person],rightOptions:[kind.option_keys.individual,kind.option_keys.person]},
        {key:'contact_sibling',left:levels.contact,right:levels.contact,directed:false,leftMax:null,rightMax:null,labels:{en:'Sibling relationship',de:'Geschwisterbeziehung'},leftLabels:{en:'Siblings',de:'Geschwister'},rightLabels:{en:'Siblings',de:'Geschwister'},leftOptions:[kind.option_keys.individual,kind.option_keys.person],rightOptions:[kind.option_keys.individual,kind.option_keys.person]},
        {key:'contact_affiliation',left:levels.contact,right:levels.contact,directed:true,leftMax:null,rightMax:null,labels:{en:'Affiliation',de:'Zugehörigkeit'},leftLabels:{en:'Affiliated contacts',de:'Zugehörige Kontakte'},rightLabels:{en:'Organizations',de:'Organisationen'},leftOptions:[kind.option_keys.organization],rightOptions:[kind.option_keys.individual,kind.option_keys.person]},
        {key:'distribution_members',left:levels.distribution_list,right:levels.contact,directed:true,leftMax:null,rightMax:null,labels:{en:'Distribution membership',de:'Verteilermitgliedschaft'},leftLabels:{en:'Members',de:'Mitglieder'},rightLabels:{en:'Distribution lists',de:'Verteiler'},leftOptions:undefined,rightOptions:undefined}
      ]){
        if((await sql`SELECT 1 FROM sys_module_relationship_bindings WHERE workspace_id=${workspaceId}::uuid AND relationship_key=${blueprint.key}`.execute(tx)).rows.length)continue;
        const created=await configureRelationship(tx,{workspaceId,technicalName:blueprint.key,configuration:{labels:blueprint.labels,leftLabels:blueprint.leftLabels,rightLabels:blueprint.rightLabels,directed:blueprint.directed,leftMin:0,rightMin:0,leftMax:blueprint.leftMax,rightMax:blueprint.rightMax as 1|null,allowAll:false,active:true,pairs:[{leftObjectTypeId:blueprint.left,rightObjectTypeId:blueprint.right}],leftApplicability:blueprint.leftOptions?{fieldId:kind.field_id,optionIds:blueprint.leftOptions}:null,rightApplicability:blueprint.rightOptions?{fieldId:kind.field_id,optionIds:blueprint.rightOptions}:null}},(entity,id,change,key,before,after)=>this.journal(tx,actor,workspaceId,null,entity,id,change,key,before,after),'module');
        await activateRelationship(tx,{workspaceId,relationshipTypeId:created.id,version:created.version},actor);
        await sql`INSERT INTO sys_module_relationship_bindings(workspace_id,module_key,relationship_key,relationship_type_id) VALUES(${workspaceId}::uuid,${moduleKey},${blueprint.key},${created.id}::uuid)`.execute(tx);
      }
    }
    for(const id of freshObjects){
      const fields=(await sql<{id:string;technicalName:string;kind:string;config:FieldConfig}>`SELECT id,technical_name AS "technicalName",kind,config FROM sys_fields WHERE object_type_id=${id}::uuid AND state='active' ORDER BY id`.execute(tx)).rows;
      const relationships=formRelationshipFields(await relationshipTypes(tx,workspaceId),id,await primaryChain(tx,workspaceId));
      const profile=await workProfile(tx,id);
      let layout=profile?workFormLayout(profile,fields,relationships):resolveFormLayout(undefined,fields,true,relationships);
      const contact=await contactProfile(tx,id);if(contact)layout=contactRelationshipListLayout(contact,layout);
      layout.groups[0].id=v7();
      // Supplied fresh templates retain the module-gated slot before Projects is enabled.
      // Normal form resolution hides the unavailable element; authored layouts are untouched.
      if(!layout.groups.some(group=>group.fields.some(entry=>'primary' in entry))){
        const classification=layout.groups.findIndex(group=>group.id==='classification');
        layout.groups.splice(classification<0?1:classification,0,{id:v7(),labels:{en:'Primary association',de:'Hauptzuordnung'},fields:[{primary:true,width:'full',visible:true}]});
      }
      const previous=(await this.definitions.objectType(tx,id)).form_layouts?.default??null;
      await sql`UPDATE sys_object_types SET form_layouts=${JSON.stringify({default:layout})}::jsonb,version=version+1 WHERE id=${id}::uuid`.execute(tx);
      await this.journal(tx,actor,workspaceId,id,'object_type',id,v7(),'form_layout.default',previous,layout);
    }
    return {contact:levels.contact,project:levels.project,case:levels.case};
  }


}
