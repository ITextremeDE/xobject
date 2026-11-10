import {contentAccess} from './content-permissions.js';
import { sql } from 'kysely';
import { effectiveWorkspaceLanguage, formLayoutSchema, formLayoutEntries, type Language } from '@xobject/contracts';
import type { Executor } from './database.js';

type Labels = Record<string, string>;
type Row = Record<string, unknown>;
type Context = { id: string; technical_name: string; code: string; labels: Labels; default_language: Language; available_languages: Language[]; state: string };

/** Read-only current names supplement the immutable event; they are not historical snapshots. */
export async function enrichJournalContext(tx: Executor, rows: Row[], userId: string, includeRecords: boolean): Promise<Row[]> {
  if (!rows.length) return rows;
  const viewer=(await sql<{language:Language|null;is_admin:boolean}>`SELECT language,is_admin FROM sys_users WHERE id=${userId}`.execute(tx)).rows[0],language=viewer.language;
  const objectIds = [...new Set(rows.map(row => row.object_type_id).filter((id): id is string => typeof id === 'string'))];
  const types = objectIds.length ? (await sql<Context>`SELECT o.id, o.technical_name, o.labels, o.state, w.code, w.default_language, w.available_languages FROM sys_object_types o JOIN sys_workspaces w ON w.id = o.workspace_id WHERE o.id = ANY(${objectIds}::uuid[])`.execute(tx)).rows : [];
  const fieldIds = [...new Set(rows.map(row => row.field_id).filter((id): id is string => typeof id === 'string'))];
  const fields = fieldIds.length ? (await sql<{ id: string; labels: Labels }>`SELECT id, labels FROM sys_fields WHERE id = ANY(${fieldIds}::uuid[])`.execute(tx)).rows : [];
  const principalKeys=rows.map(row=>/^permission\.(user|group):([^.]+)\./.exec(String(row.field_key))).filter((match):match is RegExpExecArray=>Boolean(match));
  const principalNames=new Map<string,string>();
  if(principalKeys.length){
    const ids=principalKeys.map(match=>match[2]);
    for(const row of (await sql<{kind:string;id:string;name:string}>`SELECT 'user' AS kind,id,name FROM sys_users WHERE id=ANY(${ids}::text[]) UNION ALL SELECT 'group',id::text,name FROM sys_groups WHERE id::text=ANY(${ids}::text[])`.execute(tx)).rows)principalNames.set(`${row.kind}:${row.id}`,row.name);
  }
  const credentialIds=rows.filter(row=>['api_credential','oauth_credential'].includes(String(row.entity_kind))).map(row=>String(row.entity_id));
  const credentialContexts=new Map(credentialIds.length?(await sql<{id:string;name:string;userId:string;userName:string}>`SELECT c.id,c.name,c.user_id AS "userId",u.name AS "userName" FROM sys_api_credentials c JOIN sys_users u ON u.id=c.user_id WHERE c.id=ANY(${credentialIds}::uuid[]) UNION ALL SELECT t.id::uuid,COALESCE(c.name,c.client_id),t.user_id,u.name FROM sys_oauth_access_token t JOIN sys_oauth_client c ON c.client_id=t.client_id JOIN sys_users u ON u.id=t.user_id WHERE t.id=ANY(${credentialIds}::text[]) UNION ALL SELECT t.id::uuid,COALESCE(c.name,c.client_id),t.user_id,u.name FROM sys_oauth_refresh_token t JOIN sys_oauth_client c ON c.client_id=t.client_id JOIN sys_users u ON u.id=t.user_id WHERE t.id=ANY(${credentialIds}::text[]) UNION ALL SELECT t.id::uuid,COALESCE(c.name,c.client_id),t.user_id,u.name FROM sys_oauth_consent t JOIN sys_oauth_client c ON c.client_id=t.client_id JOIN sys_users u ON u.id=t.user_id WHERE t.id=ANY(${credentialIds}::text[])`.execute(tx)).rows.map(({id,...context})=>[id,context]):[]);
  // A revoked authorization no longer has a live consent row. Retain its safe
  // application/owner labels from the immutable event, never from token secrets.
  const oauthSnapshots=rows.filter(row=>row.entity_kind==='oauth_credential').map(row=>({id:String(row.entity_id),value:(row.new_value&&typeof row.new_value==='object'?row.new_value:row.old_value) as {name?:string;userId?:string}|null})).filter(item=>item.value?.name&&item.value?.userId);
  if(oauthSnapshots.length){
    const users=(await sql<{id:string;name:string}>`SELECT id,name FROM sys_users WHERE id=ANY(${oauthSnapshots.map(item=>item.value!.userId!)}::text[])`.execute(tx)).rows;
    for(const {id,value} of oauthSnapshots){const user=users.find(user=>user.id===value!.userId);if(user&&!credentialContexts.has(id))credentialContexts.set(id,{name:value!.name!,userId:user.id,userName:user.name});}
  }
  const typeMap = new Map(types.map(type => [type.id, type]));
  const fieldMap = new Map(fields.map(field => [field.id, field]));
  const label = (labels: Labels, type: Context) => {
    const effective = effectiveWorkspaceLanguage(language, type.available_languages, type.default_language);
    return labels[effective] ?? labels[type.default_language] ?? labels.en ?? labels.de ?? Object.values(labels)[0];
  };
  const relationshipIds = [...new Set(rows.filter(row => row.entity_kind === 'relationship_type').map(row => String(row.entity_id)))];
  const relationshipNames = new Map<string, string>();
  if (relationshipIds.length) {
    const relationshipTypes = (await sql<Context>`SELECT r.id, r.technical_name, r.labels, 'active' AS state, w.code, w.default_language, w.available_languages FROM sys_relationship_types r JOIN sys_workspaces w ON w.id=r.workspace_id WHERE r.id=ANY(${relationshipIds}::uuid[])`.execute(tx)).rows;
    for (const relation of relationshipTypes) relationshipNames.set(relation.id, label(relation.labels, relation));
  }
  // Resolve names for layout snapshots without changing immutable old/new values.
  // These are explicitly current metadata labels, including retained tombstones.
  const layoutRows=rows.filter(row=>String(row.field_key).startsWith('form_layout.'));
  const layoutObjectIds=[...new Set(layoutRows.map(row=>String(row.object_type_id)))];
  const layoutFields=layoutObjectIds.length?(await sql<{id:string;object_type_id:string;labels:Labels}>`SELECT id,object_type_id,labels FROM sys_fields WHERE object_type_id=ANY(${layoutObjectIds}::uuid[])`.execute(tx)).rows:[];
  const layoutRelations=layoutRows.length?(await sql<{id:string;workspace_id:string;left_labels:Labels;right_labels:Labels}>`SELECT id,workspace_id,left_labels,right_labels FROM sys_relationship_types WHERE workspace_id=ANY(${[...new Set(layoutRows.map(row=>String(row.workspace_id)))]}::uuid[])`.execute(tx)).rows:[];
  const layoutContexts=new Map<string,{fields:Record<string,string>;relationships:Record<string,{left:string;right:string}>}>();
  for(const row of layoutRows){
    const type=typeMap.get(String(row.object_type_id));if(!type)continue;
    const entries=[row.old_value,row.new_value].flatMap(value=>{const parsed=formLayoutSchema.safeParse(value);return parsed.success?formLayoutEntries(parsed.data):[];});
    const fieldIds=new Set(entries.flatMap(entry=>'fieldId' in entry?[entry.fieldId]:[]));
    const relationIds=new Set(entries.flatMap(entry=>'relationshipTypeId' in entry?[entry.relationshipTypeId]:[]));
    layoutContexts.set(String(row.id),{
      fields:Object.fromEntries(layoutFields.filter(field=>field.object_type_id===type.id&&fieldIds.has(field.id)).map(field=>[field.id,label(field.labels,type)])),
      relationships:Object.fromEntries(layoutRelations.filter(relation=>relation.workspace_id===row.workspace_id&&relationIds.has(relation.id)).map(relation=>[relation.id,{left:label(relation.left_labels,type),right:label(relation.right_labels,type)}])),
    });
  }
  const names = new Map<string, string>();
  const removedIds=rows.filter(row=>row.entity_kind==='record').map(row=>String(row.entity_id));
  if(includeRecords&&viewer.is_admin&&removedIds.length)for(const row of (await sql<{object_type_id:string;record_id:string;deleted_keyword:string}>`SELECT object_type_id,record_id,deleted_keyword FROM sys_record_identities WHERE deleted_at IS NOT NULL AND record_id=ANY(${removedIds}::uuid[])`.execute(tx)).rows)names.set(`${row.object_type_id}:${row.record_id}`,row.deleted_keyword);
  if (includeRecords) for (const type of types) {
    const ids = [...new Set(rows.filter(row => row.entity_kind === 'record' && row.object_type_id === type.id).map(row => String(row.entity_id)))];
    if (!ids.length || type.state === 'deleted') continue;
    const keyword = (await sql`SELECT 1 FROM sys_fields WHERE object_type_id = ${type.id}::uuid AND technical_name = 'keyword' AND state <> 'deleted'`.execute(tx)).rows.length > 0;
    if (!keyword) continue;
    // Identifiers come exclusively from trusted, validated model metadata.
    const records = (await sql<{ id: string; keyword: string | null }>`SELECT id, ${await contentAccess().keywordValue(type.id)} AS keyword FROM ${sql.table(`${type.code}_${type.technical_name}`)} WHERE id = ANY(${ids}::uuid[])`.execute(tx)).rows;
    for (const record of records) if (record.keyword) names.set(`${type.id}:${record.id}`, record.keyword);
  }
  rows = await enrichRecordSecurityContext(tx, rows);
  return rows.map(row => {
    const type = typeMap.get(String(row.object_type_id)), field = fieldMap.get(String(row.field_id));
    return { ...row,
      ...(credentialContexts.has(String(row.entity_id))?{credential_context:credentialContexts.get(String(row.entity_id))}:{}),
      ...(layoutContexts.has(String(row.id))?{form_layout_context:layoutContexts.get(String(row.id))}:{}),
      object_type_name: type ? label(type.labels, type) : null,
      field_label: field ? (type?label(field.labels,type):field.labels[language??'en']??field.labels.en??field.labels.de??Object.values(field.labels)[0]) : null,
      entity_name: (['api_credential','oauth_credential'].includes(String(row.entity_kind))?(()=>{const credential=credentialContexts.get(String(row.entity_id));return credential?`${credential.name} · ${credential.userName}`:undefined;})():undefined) ?? (row.entity_kind==='object_permissions'&&type?`${label(type.labels,type)}${(()=>{const match=/^permission\.(user|group):([^.]+)\./.exec(String(row.field_key));return match?' · '+(principalNames.get(`${match[1]}:${match[2]}`)??match[2]):'';})()}`:undefined) ?? (row.entity_kind==='relationship' ? (()=>{const snapshot=(row.new_value??row.old_value) as {left?:{keyword?:string};right?:{keyword?:string};directed?:boolean}|null;return snapshot?.left?.keyword&&snapshot.right?.keyword?`${snapshot.left.keyword} ${snapshot.directed?'→':'↔'} ${snapshot.right.keyword}`:undefined;})() : undefined) ?? (row.entity_kind === 'relationship_type' ? relationshipNames.get(String(row.entity_id)) : undefined) ?? (type && row.entity_kind === 'object_type' ? label(type.labels, type)
        : type && field && ['field', 'classification_field'].includes(String(row.entity_kind)) ? label(field.labels, type)
        : names.get(`${row.object_type_id}:${row.entity_id}`) ?? row.entity_name ?? null),
    };
  });
}

/** Resolve only identities actually present in already-authorized security events. */
export async function enrichRecordSecurityContext<T extends {field_key?:unknown;old_value?:unknown;new_value?:unknown}>(tx:Executor,rows:T[]):Promise<T[]> {
 const keys=new Set<string>();
 for(const row of rows){
  if(!String(row.field_key).startsWith('access.'))continue;
  const match=/^access\.field\.(user|group):([^.]+)\./.exec(String(row.field_key));if(match)keys.add(`${match[1]}:${match[2]}`);
  if(row.field_key==='access.owners')for(const value of [row.old_value,row.new_value])if(Array.isArray(value))for(const p of value)if(p&&['user','group'].includes(p.kind)&&typeof p.id==='string')keys.add(`${p.kind}:${p.id}`);
 }
 if(!keys.size)return rows;
 const ids=[...keys].map(key=>key.slice(key.indexOf(':')+1));
 const names=new Map((await sql<{kind:string;id:string;name:string}>`SELECT 'user' AS kind,id,name FROM sys_users WHERE id=ANY(${ids}::text[]) UNION ALL SELECT 'group',id::text,name FROM sys_groups WHERE id::text=ANY(${ids}::text[])`.execute(tx)).rows.map(p=>[`${p.kind}:${p.id}`,p.name]));
 return rows.map(row=>{
  const used=new Set<string>(),match=/^access\.field\.(user|group):([^.]+)\./.exec(String(row.field_key));if(match)used.add(`${match[1]}:${match[2]}`);
  if(row.field_key==='access.owners')for(const value of [row.old_value,row.new_value])if(Array.isArray(value))for(const p of value)if(p&&['user','group'].includes(p.kind))used.add(`${p.kind}:${p.id}`);
  return used.size?{...row,security_context:{principals:Object.fromEntries([...used].filter(key=>names.has(key)).map(key=>[key,names.get(key)!]))}}:row;
 });
}
