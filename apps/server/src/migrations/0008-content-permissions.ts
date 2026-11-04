import {sql} from 'kysely';
import type {Executor} from '../database.js';
export async function installContentPermissions(tx:Executor){
  await sql`ALTER TABLE sys_object_types ADD COLUMN is_sensitive boolean NOT NULL DEFAULT false,ADD COLUMN permissions_version integer NOT NULL DEFAULT 1`.execute(tx);
  await sql`CREATE TABLE sys_content_grants(object_type_id uuid NOT NULL REFERENCES sys_object_types(id) ON DELETE RESTRICT,principal_kind text NOT NULL CHECK(principal_kind IN('user','group')),principal_id text NOT NULL,level text CHECK(level IN('none','read','edit','delete','full')),fields jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(fields)='object'),PRIMARY KEY(object_type_id,principal_kind,principal_id))`.execute(tx);
  await sql`CREATE INDEX sys_content_grants_principal_idx ON sys_content_grants(principal_kind,principal_id,object_type_id)`.execute(tx);
}
