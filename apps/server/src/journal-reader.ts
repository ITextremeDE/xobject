import {sql,type RawBuilder} from 'kysely';
import type {Executor} from './database.js';
import {contentAccess,readableRecordJournal} from './content-permissions.js';
import {journalValueContexts} from './record-journal.js';
import type {JournalEntry} from '@xobject/contracts';

/** Authorize identities/fields before count and page; hydrate immutable values only for that page. */
export async function recordJournalPage(tx:Executor,args:{objectTypeId:string;recordId:string;includeRecycled?:boolean;fieldId?:string;entityKind?:string;limit:number;offset:number},workspace:string){
 const access=contentAccess(),source=await access.policy(args.objectTypeId);
 const where=sql`j.workspace_id=${workspace}::uuid AND ((j.object_type_id=${args.objectTypeId}::uuid AND j.entity_kind='record' AND j.entity_id=${args.recordId}::uuid) OR EXISTS(SELECT 1 FROM sys_relationship_journal_endpoints ep WHERE ep.journal_id=j.id AND ep.object_type_id=${args.objectTypeId}::uuid AND ep.record_id=${args.recordId}::uuid)) AND ${args.fieldId?sql`j.field_id=${args.fieldId}::uuid`:sql`true`} AND ${args.entityKind?sql`j.entity_kind=${args.entityKind}`:sql`true`}`;
 const objectIds=(await sql<{id:string}>`SELECT DISTINCT o.id FROM sys_object_types o WHERE o.workspace_id=${workspace}::uuid AND (o.id=${args.objectTypeId}::uuid OR EXISTS(SELECT 1 FROM sys_relationship_journal_endpoints ep JOIN sys_relationship_journal_endpoints own ON own.journal_id=ep.journal_id WHERE own.object_type_id=${args.objectTypeId}::uuid AND own.record_id=${args.recordId}::uuid AND ep.object_type_id=o.id))`.execute(tx)).rows;
 const branches:RawBuilder<boolean>[]=[];
 for(const {id} of objectIds){
  const p=await access.policy(id);
  const fields=(await sql<{id:string}>`SELECT f.id FROM sys_fields f WHERE f.object_type_id=${id}::uuid OR EXISTS(SELECT 1 FROM sys_relationship_type_pairs pair WHERE pair.relationship_type_id=f.relationship_type_id AND (pair.left_object_type_id=${id}::uuid OR pair.right_object_type_id=${id}::uuid))`.execute(tx)).rows;
  const readable=fields.filter(f=>p.field(f.id).read).map(f=>f.id);
  const policy=sql`COALESCE(sp.policy,ri.deleted_policy)`,field=sql`j.field_id::text`;
  const fieldRight=sql`(j.field_id IS NULL OR (j.field_id=ANY(${readable}::uuid[]) AND ${p.sensitive&&!p.admin?sql`${p.query.field(policy,field,p.groups)}>=2`:sql`true`}))`;
  const recordRight=p.admin?sql`true`:p.level<2?sql`false`:p.sensitive?sql`${p.query.level(policy)}>=2`:sql`true`;
  const frozen=sql`ri.deleted_readers->${access.actor}`;
  const prior=sql`${frozen} IS NOT NULL AND (j.field_id IS NULL OR ${frozen}->'fields' ? j.field_id::text) AND (j.entity_kind<>'relationship' OR ${frozen}->'events' ? j.id::text) AND ${frozen}->'contexts' ? ${`${args.objectTypeId}:${args.recordId}`}`;
  branches.push(sql<boolean>`ref.object_type_id=${id}::uuid AND ${recordRight} AND ${fieldRight} AND (ri.deleted_at IS NOT NULL AND ${p.admin?sql`true`:prior} OR ri.deleted_at IS NULL AND ${args.includeRecycled?sql`true`:sql`ri.recycled_at IS NULL`})`);
 }
 const allowed=branches.length?sql.join(branches,sql` OR `):sql`false`;
 // A record event refers to its own identity; relationship events require both endpoints.
 const refs=sql`SELECT j.object_type_id,j.entity_id AS record_id WHERE j.entity_kind='record' UNION SELECT ep.object_type_id,ep.record_id FROM sys_relationship_journal_endpoints ep WHERE ep.journal_id=j.id AND j.entity_kind='relationship'`;
 const cte=sql`WITH eligible AS (SELECT j.id FROM sys_journal j WHERE ${where} AND NOT EXISTS(SELECT 1 FROM (${refs}) ref LEFT JOIN sys_record_identities ri ON ri.object_type_id=ref.object_type_id AND ri.record_id=ref.record_id LEFT JOIN sys_record_security sp ON sp.object_type_id=ri.object_type_id AND sp.record_id=ri.record_id WHERE ri.record_id IS NULL OR NOT (${allowed})) AND (j.entity_kind='record' OR (SELECT count(*) FROM sys_relationship_journal_endpoints ep WHERE ep.journal_id=j.id)=2)),
 visible AS (SELECT DISTINCT ${source.admin?sql`j.id`:sql`CASE WHEN removed.record_id IS NOT NULL THEN notice.id ELSE j.id END`} AS id FROM eligible e JOIN sys_journal j ON j.id=e.id
 LEFT JOIN LATERAL (SELECT ri.object_type_id,ri.record_id FROM (${refs}) ref JOIN sys_record_identities ri ON ri.object_type_id=ref.object_type_id AND ri.record_id=ref.record_id WHERE ri.deleted_at IS NOT NULL) removed ON true
 LEFT JOIN LATERAL (SELECT n.id FROM sys_journal n WHERE n.object_type_id=removed.object_type_id AND n.entity_id=removed.record_id AND n.entity_kind='record' AND n.field_key='lifecycle' AND n.new_value='"deleted"'::jsonb ORDER BY n.id DESC LIMIT 1) notice ON true)`;
 const total=(await sql<{n:number}>`${cte} SELECT count(*)::int AS n FROM visible WHERE id IS NOT NULL`.execute(tx)).rows[0].n;
 const entries=(await sql<JournalEntry>`${cte} SELECT j.*,a.name AS actor_name FROM visible v JOIN sys_journal j ON j.id=v.id LEFT JOIN sys_users a ON a.id=j.actor_id ORDER BY j.created_at DESC,j.id DESC LIMIT ${args.limit} OFFSET ${args.offset}`.execute(tx)).rows;
 // Reuse the canonical historical redaction for the bounded page, never return raw snapshots.
 return {entries:await journalValueContexts(tx,await readableRecordJournal(args.objectTypeId,entries,args.includeRecycled,args.recordId)),total,offset:args.offset,limit:args.limit};
}
