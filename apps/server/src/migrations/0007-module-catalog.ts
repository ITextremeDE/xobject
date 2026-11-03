import {sql} from 'kysely';
import type {Executor} from '../database.js';

export async function installModuleCatalog(tx:Executor) {
  await sql`CREATE TABLE IF NOT EXISTS sys_modules(key text PRIMARY KEY,labels jsonb NOT NULL,description jsonb NOT NULL,available boolean NOT NULL,position integer NOT NULL,objects jsonb NOT NULL)`.execute(tx);
  const objects=[
    {key:'contact',technicalName:'contacts',labels:{de:'Kontakte',en:'Contacts'},standardFields:['keyword','type_status','category']},
    {key:'project',technicalName:'projects',labels:{de:'Projekte',en:'Projects'},standardFields:['keyword','type_status','category']},
    {key:'case',technicalName:'cases',labels:{de:'Vorgänge',en:'Cases'},standardFields:['keyword','type_status','category']},
    {key:'task',technicalName:'tasks',labels:{de:'Aufgaben',en:'Tasks'},standardFields:['keyword','type_status','category']},
  ];
  for(const module of [
    {key:'contacts',labels:{de:'Kontakte & Beziehungen',en:'Contacts & Relations'},description:{de:'Kontakte für Kunden, Lieferanten, Partner und weitere Beziehungen.',en:'Contacts for customers, suppliers, partners and other relationships.'},available:false,position:1,objects:[objects[0]]},
    {key:'projects',labels:{de:'Projekte & Aufgaben',en:'Projects & Tasks'},description:{de:'Kontakte, Projekte, Vorgänge und Aufgaben mit fester Hauptzuordnung.',en:'Contacts, Projects, Cases and Tasks with a fixed Primary association chain.'},available:true,position:2,objects},
    {key:'documents',labels:{de:'Dokumente & Kommunikation',en:'Documents & Communication'},description:{de:'E-Mails und Dokumente. Die Fachfunktionen folgen später.',en:'Emails and Documents. Domain features will follow later.'},available:false,position:3,objects:[{key:'email',technicalName:'emails',labels:{de:'E-Mails',en:'Emails'}},{key:'document',technicalName:'documents',labels:{de:'Dokumente',en:'Documents'}}]},
  ])await sql`INSERT INTO sys_modules VALUES(${module.key},${JSON.stringify(module.labels)}::jsonb,${JSON.stringify(module.description)}::jsonb,${module.available},${module.position},${JSON.stringify(module.objects)}::jsonb) ON CONFLICT DO NOTHING`.execute(tx);
  await sql`ALTER TABLE sys_workspace_modules DROP CONSTRAINT IF EXISTS sys_workspace_modules_module_key_check`.execute(tx);
  await sql`ALTER TABLE sys_workspace_modules DROP CONSTRAINT IF EXISTS sys_workspace_modules_module_catalog_fkey`.execute(tx);
  await sql`ALTER TABLE sys_workspace_modules ADD CONSTRAINT sys_workspace_modules_module_catalog_fkey FOREIGN KEY(module_key) REFERENCES sys_modules(key) ON DELETE RESTRICT`.execute(tx);
  await sql`INSERT INTO sys_workspace_modules(workspace_id,module_key) SELECT w.id,m.key FROM sys_workspaces w CROSS JOIN sys_modules m ON CONFLICT DO NOTHING`.execute(tx);
  await sql`CREATE TABLE IF NOT EXISTS sys_module_object_bindings(workspace_id uuid NOT NULL REFERENCES sys_workspaces(id),object_key text NOT NULL,object_type_id uuid NOT NULL,PRIMARY KEY(workspace_id,object_key),UNIQUE(workspace_id,object_type_id),FOREIGN KEY(object_type_id,workspace_id) REFERENCES sys_object_types(id,workspace_id) ON DELETE RESTRICT)`.execute(tx);
  // Freeze explicit legacy UUID roles; never match or adopt user objects by name.
  await sql`INSERT INTO sys_module_object_bindings SELECT workspace_id,role,object_type_id FROM sys_primary_chain_levels ON CONFLICT DO NOTHING`.execute(tx);
}
