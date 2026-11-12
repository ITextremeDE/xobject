import {contactInheritanceSources,type FieldValue} from '@xobject/contracts';
import {normalizeFieldValue} from './field-types.js';
import { sql } from "kysely";
import type {
  ContactInheritanceField,
  ContactInheritanceWrite,
} from "@xobject/contracts";
import type { Executor } from "./database.js";
import { contentAccess } from "./content-permissions.js";
import { contactFields, contactProfile } from "./contact-domain.js";
import { AppError } from "./errors.js";
export const inheritedContactFields = Object.keys(contactInheritanceSources) as (keyof typeof contactInheritanceSources)[];
export async function contactInheritance(
  tx: Executor,
  objectId: string,
  recordId: string,
): Promise<ContactInheritanceField[]> {
  const profile = await contactProfile(tx, objectId);
  if (!profile) return [];
  const fields = await contactFields(tx, objectId),
    kind = fields.find((f) => f.field_key === "contact_kind")!,
    policy = await contentAccess().policy(objectId);
  if (!policy.field(kind.id, recordId).read) return [];
  const model = (
    await sql<{
      name: string;
    }>`SELECT w.code||'_'||o.technical_name AS name FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.id=${objectId}::uuid`.execute(
      tx,
    )
  ).rows[0];
  const row = (
    await sql<
      Record<string, unknown>
    >`SELECT * FROM ${sql.table(model.name)} WHERE id=${recordId}::uuid`.execute(
      tx,
    )
  ).rows[0];
  if (row?.[kind.technical_name] !== profile.kinds.person) return [];
  const source = (
    await sql<{
      id: string;
      version: number;
    }>`SELECT o.id,o.version FROM sys_relationships e JOIN ${sql.table(model.name)} o ON o.id=e.left_record_id WHERE e.relationship_type_id=${profile.relationships.contact_person}::uuid AND e.right_record_id=${recordId}::uuid AND ${policy.predicate("o")}`.execute(
      tx,
    )
  ).rows[0];
  const own = (
    await sql<{
      field_id: string;
      value: FieldValue;
    }>`SELECT field_id,value FROM sys_contact_field_overrides WHERE object_type_id=${objectId}::uuid AND record_id=${recordId}::uuid`.execute(
      tx,
    )
  ).rows;
  const result: ContactInheritanceField[] = [];
  for (const purpose of inheritedContactFields) {
    const field = fields.find((f) => f.field_key === purpose);
    if (!field || !policy.field(field.id, recordId).read) continue;
    const origin = fields.find(
      (f) =>
        f.field_key ===
        contactInheritanceSources[purpose],
    )!;
    const readable = Boolean(source && policy.field(origin.id, source.id).read),
      override = own.find((v) => v.field_id === field.id);
    const raw = readable
      ? (
          await sql<{
            value: FieldValue;
          }>`SELECT ${sql.ref(origin.technical_name)} AS value FROM ${sql.table(model.name)} WHERE id=${source.id}::uuid`.execute(
            tx,
          )
        ).rows[0].value
      : null;
    const value=raw;
    result.push({
      fieldId: field.id,
      mode: override ? "own" : "inherit",
      value: override?.value ?? value,
      inheritedValue: value,
      canEdit: policy.field(field.id, recordId).edit,
      ...(readable
        ? {
            source: {
              recordId: source.id,
              version: source.version,
              keyword: (
                await sql<{
                  keyword: string;
                }>`SELECT ${await contentAccess().keywordValue(objectId)} AS keyword FROM ${sql.table(model.name)} WHERE id=${source.id}::uuid`.execute(
                  tx,
                )
              ).rows[0].keyword,
            },
          }
        : {}),
    });
    if (override) result.at(-1)!.value = override.value;
  }
  return result;
}
export async function writeContactInheritance(
  tx: Executor,
  objectId: string,
  recordId: string,
  writes: ContactInheritanceWrite | undefined,
  journal: (
    key: string,
    before: unknown,
    after: unknown,
    field: string,
  ) => Promise<void>,
  creating = false,
) {
  if (!writes?.length) return false;
  let state = await contactInheritance(tx, objectId, recordId);
  let changed = false;
  const fields = await contactFields(tx, objectId),
    workspace = (await contentAccess().policy(objectId)).workspace;
  if (creating) {
    const profile = await contactProfile(tx, objectId),
      kind = fields.find((f) => f.field_key === "contact_kind");
    const model = (
      await sql<{
        name: string;
      }>`SELECT w.code||'_'||o.technical_name AS name FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.id=${objectId}::uuid`.execute(
        tx,
      )
    ).rows[0];
    const row = kind
      ? (
          await sql<
            Record<string, unknown>
          >`SELECT ${sql.ref(kind.technical_name)} FROM ${sql.table(model.name)} WHERE id=${recordId}::uuid`.execute(
            tx,
          )
        ).rows[0]
      : undefined;
    if (
      !profile ||
      !kind ||
      row?.[kind.technical_name] !== profile.kinds.person
    )
      throw new AppError(
        400,
        "Only Contact persons have Organization inheritance",
      );
    const policy = await contentAccess().policy(objectId);
    state = inheritedContactFields.flatMap((key) => {
      const field = fields.find((f) => f.field_key === key);
      return field
        ? [
            {
              fieldId: field.id,
              mode: "inherit" as const,
              value: null,
              inheritedValue: null,
              canEdit: policy.creationField(field.id),
            },
          ]
        : [];
    });
  }
  for (const write of writes) {
    const current = state.find((f) => f.fieldId === write.fieldId);
    if (!current || !current.canEdit)
      throw new AppError(403, "Contact inheritance field edit denied");
    if (
      write.mode === "inherit" &&
      current.mode === "own" &&
      !write.confirmReset
    )
      throw new AppError(400, "Discarding an own value requires confirmation");
    const meta=fields.find(f=>f.id===write.fieldId)!;
    const normalized=write.mode==='own'?normalizeFieldValue({...meta,kind:meta.config.schema?'structured':'text',required:false},write.value,current.value):null;
    const before = {
        mode: current.mode,
        ...(current.mode === "own" ? { value: current.value } : {}),
      },
      after = {
        mode: write.mode,
        ...(write.mode === "own" ? { value: normalized } : {}),
      };
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    if (write.mode === "own")
      await sql`INSERT INTO sys_contact_field_overrides(workspace_id,object_type_id,record_id,field_id,value) VALUES(${workspace}::uuid,${objectId}::uuid,${recordId}::uuid,${write.fieldId}::uuid,${JSON.stringify(normalized)}::jsonb) ON CONFLICT(object_type_id,record_id,field_id) DO UPDATE SET value=EXCLUDED.value`.execute(
        tx,
      );
    else
      await sql`DELETE FROM sys_contact_field_overrides WHERE object_type_id=${objectId}::uuid AND record_id=${recordId}::uuid AND field_id=${write.fieldId}::uuid`.execute(
        tx,
      );
    await journal(
      fields.find((f) => f.id === write.fieldId)!.technical_name,
      before,
      after,
      write.fieldId,
    );
    changed = true;
  }
  return changed;
}
