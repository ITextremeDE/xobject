import {
  effectiveClassification,
  resolveChoices,
  type Choices,
} from "./classification.js";
import type { z } from "zod";
import { createHash } from "node:crypto";
import { sql } from "kysely";
import {
  applyFieldDefaults,
  isCustomFieldKind,
  type FieldConfig,
  type FieldInputRules,
  type ContactInheritanceField,
  schemas,
  type ContactConversionPreview,
  type ContactInheritanceWrite,
  type FieldValue,
  type RelationshipWrite,
} from "@xobject/contracts";
import type { Executor } from "./database.js";
import {
  contactDerivedValue,
  contactFields,
  contactProfile,
  validateContact,
} from "./contact-domain.js";
import { contactInheritance } from "./contact-inheritance.js";
import { contentAccess } from "./content-permissions.js";
import { relationshipTypes } from "./relationship-types.js";
import { applies } from "./field-applicability.js";
import {
  normalizeFieldValue,
  validateReferences,
  isEmptyFieldValue,
} from "./field-types.js";
import { AppError } from "./errors.js";
type Row = Record<string, unknown> & { id: string; version: number };
export async function contactConversionPlan(
  tx: Executor,
  args: z.infer<typeof schemas.get_contact_conversion_preview>,
) {
  const profile = await contactProfile(tx, args.objectTypeId);
  if (!profile)
    throw new AppError(400, "Contact conversions require the Contacts module");
  const model = (
    await sql<{
      workspace_id: string;
      name: string;
      version: number;
      state: string;
      classification: import("@xobject/contracts").ClassificationConfig;
    }>`SELECT o.classification,o.workspace_id,w.code||'_'||o.technical_name AS name,o.version,o.state FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.id=${args.objectTypeId}::uuid`.execute(
      tx,
    )
  ).rows[0];
  if (model.state !== "active")
    throw new AppError(400, "Contact object is inactive");
  const policy = await contentAccess().require(
    args.objectTypeId,
    args.recordId,
    "full",
  );
  const fields = (
    await sql<{
      id: string;
      technical_name: string;
      value_mode: string;
      state: string;
      required: boolean;
      kind: string;
      config: FieldConfig;
      input_rules: FieldInputRules;
      applicability?: import("@xobject/contracts").FieldApplicability;
    }>`SELECT * FROM sys_fields WHERE object_type_id=${args.objectTypeId}::uuid AND state<>'deleted'`.execute(
      tx,
    )
  ).rows;
  const bindings = await contactFields(tx, args.objectTypeId),
    name = (key: string) =>
      bindings.find((f) => f.field_key === key)!.technical_name;
  const fetch = async (id: string) => {
    await contentAccess().require(args.objectTypeId, id, "full");
    return (
      await sql<Row>`SELECT * FROM ${sql.table(model.name)} WHERE id=${id}::uuid`.execute(
        tx,
      )
    ).rows[0];
  };
  if (!policy.field(profile.fields.contact_kind, args.recordId).edit)
    throw new AppError(403, "Contact kind field edit denied");
  const root = await fetch(args.recordId);
  if (root.version !== args.version)
    throw new AppError(409, "Record version conflict");
  const definitions = await relationshipTypes(tx, model.workspace_id),
    membership = definitions.find(
      (d) => d.id === profile.relationships.contact_person,
    )!;
  const edges = (
    await sql<{
      id: string;
      relationship_type_id: string;
      left_object_type_id: string;
      left_record_id: string;
      right_object_type_id: string;
      right_record_id: string;
      version: number;
    }>`SELECT * FROM sys_relationships WHERE workspace_id=${model.workspace_id}::uuid AND (left_object_type_id=${args.objectTypeId}::uuid AND (left_record_id=${root.id}::uuid OR (${args.action === "dissolve_organization"} AND left_record_id IN (SELECT right_record_id FROM sys_relationships WHERE relationship_type_id=${membership.id}::uuid AND left_record_id=${root.id}::uuid))) OR right_object_type_id=${args.objectTypeId}::uuid AND (right_record_id=${root.id}::uuid OR (${args.action === "dissolve_organization"} AND right_record_id IN (SELECT right_record_id FROM sys_relationships WHERE relationship_type_id=${membership.id}::uuid AND left_record_id=${root.id}::uuid)))) ORDER BY id`.execute(
      tx,
    )
  ).rows;
  const rootKind = root[name("contact_kind")],
    individual =
      args.action === "individual" || args.action === "dissolve_organization";
  if (
    rootKind !==
    (args.action === "dissolve_organization"
      ? profile.kinds.organization
      : args.action === "individual"
        ? profile.kinds.person
        : profile.kinds.individual)
  )
    throw new AppError(
      400,
      "Conversion does not match the current Contact kind",
    );
  if (
    (args.action === "existing_organization" && !args.organizationId) ||
    (args.action !== "existing_organization" && args.organizationId)
  )
    throw new AppError(
      400,
      "Choose an Organization only for conversion to an existing Organization",
    );
  if (
    args.action !== "new_organization" &&
    (Object.keys(args.organizationValues).length ||
      Object.keys(args.organizationClassification).length)
  )
    throw new AppError(
      400,
      "Organization values are only accepted for a new Organization",
    );
  let organization: Row | undefined;
  if (args.organizationId) {
    await contentAccess().require(
      args.objectTypeId,
      args.organizationId,
      "read",
    );
    organization = (
      await sql<Row>`SELECT * FROM ${sql.table(model.name)} WHERE id=${args.organizationId}::uuid`.execute(
        tx,
      )
    ).rows[0];
    if (!policy.field(profile.fields.contact_kind, organization.id).read)
      throw new AppError(403, "Organization Contact kind read denied");
    if (organization[name("contact_kind")] !== profile.kinds.organization)
      throw new AppError(400, "Target is not an Organization");
  }
  if (args.action === "new_organization")
    await contentAccess().require(args.objectTypeId, undefined, "create");
  const members = edges.filter(
    (e) =>
      e.relationship_type_id === membership.id && e.left_record_id === root.id,
  );
  const sources =
    args.action === "dissolve_organization"
      ? await Promise.all(members.map((e) => fetch(e.right_record_id)))
      : [root];
  if (!sources.length)
    throw new AppError(400, "Organization has no Contact persons");
  if (
    Object.keys(args.contactValues).some(
      (id) => !sources.some((r) => r.id === id),
    )
  )
    throw new AppError(400, "Contact values reference an unaffected record");
  const issues: ContactConversionPreview["issues"] = [],
    plans: {
      row: Row;
      values: Record<string, FieldValue>;
      inheritance: ContactInheritanceWrite;
      sourceState: ContactInheritanceField[];
      relationships: RelationshipWrite[];
    }[] = [];
  let organizationClassification: Choices | undefined;
  const organizationValues: Record<string, FieldValue> =
    args.action === "new_organization"
      ? {
          [name("contact_kind")]: profile.kinds.organization,
          [name("company_name")]: root[name("company_name")] as FieldValue,
          [name("commercial_register")]: root[
            name("commercial_register")
          ] as FieldValue,
          ...args.organizationValues,
        }
      : {};
  const checkInput = (values: Record<string, unknown>) => {
    for (const key of Object.keys(values))
      if (
        !fields.some(
          (f) =>
            f.technical_name === key &&
            f.state === "active" &&
            f.value_mode !== "derived" &&
            isCustomFieldKind(f.kind) &&
            !["keyword", "record_number", "access_principals"].includes(key),
        )
      )
        throw new AppError(400, "Unknown or reserved Contact conversion field");
  };
  checkInput(args.organizationValues);
  for (const values of Object.values(args.contactValues)) checkInput(values);
  const validateValues = async (
    resulting: Record<string, unknown>,
    recordId?: string,
  ) => {
    for (const field of fields.filter(
      (f) =>
        f.state === "active" &&
        f.value_mode !== "derived" &&
        isCustomFieldKind(f.kind),
    )) {
      if (!applies(field, fields, resulting)) {
        if (!isEmptyFieldValue(resulting[field.technical_name]))
          issues.push({
            code: "incompatible_field",
            recordId,
            ...(policy.field(field.id, recordId).read
              ? { fieldId: field.id }
              : {}),
          });
        continue;
      }
      try {
        const normalized = normalizeFieldValue(
          field,
          resulting[field.technical_name],
        );
        await validateReferences(
          tx,
          field,
          normalized,
          model.workspace_id,
          resulting[field.technical_name],
        );
      } catch {
        issues.push({
          code: "invalid_field",
          recordId,
          ...(policy.field(field.id, recordId).read
            ? { fieldId: field.id }
            : {}),
        });
      }
    }
  };
  if (args.action === "new_organization") {
    organizationValues[name("contact_kind")] = profile.kinds.organization;
    Object.assign(
      organizationValues,
      applyFieldDefaults(
        fields.map((f) => ({
          ...f,
          technicalName: f.technical_name,
          inputRules: policy.creationField(f.id) ? f.input_rules : undefined,
        })),
        organizationValues,
      ),
    );
    await contentAccess().checkWrites(
      args.objectTypeId,
      args.organizationClassification,
    );
    try {
      organizationClassification = resolveChoices(
        effectiveClassification(model.classification, fields),
        args.organizationClassification,
      );
    } catch {
      issues.push({ code: "invalid_classification" });
    }
    await contentAccess().checkWrites(args.objectTypeId, organizationValues);
    await validateValues(organizationValues);
    try {
      await validateContact(tx, args.objectTypeId, organizationValues);
    } catch {
      issues.push({
        code: "organization_name_required",
        fieldId: profile.fields.company_name,
      });
    }
  }
  for (const row of sources) {
    if (!policy.field(profile.fields.contact_kind, row.id).edit)
      throw new AppError(403, "Contact kind field edit denied");
    const values: Record<string, FieldValue> = {
      [name("contact_kind")]: individual
        ? profile.kinds.individual
        : profile.kinds.person,
      ...args.contactValues[row.id],
    };
    values[name("contact_kind")] = individual
      ? profile.kinds.individual
      : profile.kinds.person;
    const inheritance: ContactInheritanceWrite = [];
    let sourceState: ContactInheritanceField[] = [];
    if (individual) {
      for (const edge of edges.filter(
        (e) =>
          e.relationship_type_id === membership.id &&
          e.right_record_id === row.id,
      ))
        await contentAccess().require(
          args.objectTypeId,
          edge.left_record_id,
          "read",
        );
      const inherited = await contactInheritance(tx, args.objectTypeId, row.id);
      sourceState = inherited;
      for (const [purpose, target] of [
        ["organization_name", "company_name"],
        ["organization_commercial_register", "commercial_register"],
      ] as const) {
        const field = inherited.find(
          (f) => f.fieldId === profile.fields[purpose],
        );
        // Never materialize a source field the actor cannot currently read.
        if (!field)
          throw new AppError(403, "Conversion needs readable inherited fields");
        if (field.mode === "own" && !field.canEdit)
          throw new AppError(403, "Contact inheritance field edit denied");
        if (
          field.mode === "inherit" &&
          !field.source &&
          edges.some(
            (e) =>
              e.relationship_type_id === membership.id &&
              e.right_record_id === row.id,
          )
        )
          throw new AppError(
            403,
            "Conversion needs readable Organization source fields",
          );
        if (!Object.hasOwn(values, name(target)))
          values[name(target)] = field.value;
      }
    } else {
      for (const [source, purpose] of [
        ["company_name", "organization_name"],
        ["commercial_register", "organization_commercial_register"],
      ] as const) {
        const field = bindings.find((f) => f.field_key === source)!;
        if (!policy.field(field.id, row.id).read)
          throw new AppError(
            403,
            "Conversion needs readable Organization fields",
          );
        const targetValue =
          args.action === "new_organization"
            ? organizationValues[name(source)]
            : organization?.[name(source)];
        const canCompare =
          args.action === "new_organization" ||
          (organization && policy.field(field.id, organization.id).read);
        if (
          !isEmptyFieldValue(row[name(source)]) &&
          (!canCompare || row[name(source)] !== targetValue)
        )
          inheritance.push({
            fieldId: profile.fields[purpose],
            mode: "own",
            value: String(row[name(source)]),
          });
        values[name(source)] = null;
      }
    }
    const resulting = { ...row, ...values };
    for (const field of fields) {
      if (field.value_mode === "derived") continue;
      if (
        !applies(field, fields, resulting) &&
        (!isEmptyFieldValue(resulting[field.technical_name]) ||
          (![name("company_name"), name("commercial_register")].includes(
            field.technical_name,
          ) &&
            !isEmptyFieldValue(row[field.technical_name])))
      )
        issues.push({
          code: "incompatible_field",
          recordId: row.id,
          ...(policy.field(field.id, row.id).read ? { fieldId: field.id } : {}),
        });
      if (
        field.required &&
        field.state === "active" &&
        applies(field, fields, resulting) &&
        isEmptyFieldValue(resulting[field.technical_name])
      )
        issues.push({
          code: "required_field",
          recordId: row.id,
          ...(policy.field(field.id, row.id).read ? { fieldId: field.id } : {}),
        });
    }
    for (const edge of edges.filter(
      (e) =>
        (e.left_record_id === row.id &&
          e.left_object_type_id === args.objectTypeId) ||
        (e.right_record_id === row.id &&
          e.right_object_type_id === args.objectTypeId),
    )) {
      if (individual && edge.relationship_type_id === membership.id) continue;
      const type = definitions.find((d) => d.id === edge.relationship_type_id)!;
      const side = edge.left_record_id === row.id ? "left" : "right",
        rule =
          side === "left" ? type.leftApplicability : type.rightApplicability;
      if (
        rule &&
        !applies(
          { id: "", technical_name: "", applicability: rule },
          fields,
          resulting,
        )
      )
        issues.push({ code: "incompatible_relationship", recordId: row.id });
    }
    await validateValues(resulting, row.id);
    try {
      await validateContact(tx, args.objectTypeId, resulting);
    } catch {
      issues.push({ code: "contact_name_required", recordId: row.id });
    }
    for (const write of inheritance)
      if (!policy.field(write.fieldId, row.id).edit)
        throw new AppError(403, "Contact inheritance field edit denied");
    await contentAccess().checkWrites(args.objectTypeId, values, row);
    const relationships: RelationshipWrite[] = individual
      ? [
          {
            relationshipTypeId: membership.id,
            version: membership.version,
            side: "right",
            targets: [],
          },
        ]
      : [];
    plans.push({ row, values, inheritance, sourceState, relationships });
  }
  const changes = [];
  for (const plan of plans) {
    const projected = await contentAccess().project(
      args.objectTypeId,
      plan.row,
    );
    const organizationName=individual?null:args.action==='new_organization'?String(organizationValues[name('company_name')]??''):organization&&policy.field(profile.fields.company_name,organization.id).read?String(organization[name('company_name')]??''):null;
    const targetExpression=await contactDerivedValue(tx,args.objectTypeId,policy,'keyword','preview_contact',{values:plan.values,organization:{present:!individual,name:organizationName}});
    const targetKeyword=(await sql<{keyword:string}>`SELECT ${targetExpression} AS keyword FROM ${sql.table(model.name)} AS preview_contact WHERE id=${plan.row.id}::uuid`.execute(tx)).rows[0].keyword;
    changes.push({
      targetKeyword,
      recordId: plan.row.id,
      keyword: String(projected.keyword),
      version: plan.row.version,
      from: String(plan.row[name("contact_kind")]),
      to: String(plan.values[name("contact_kind")]),
      values: plan.values,
      beforeValues: Object.fromEntries(
        Object.keys(plan.values).map((key) => [
          key,
          (plan.row[key] as FieldValue) ?? null,
        ]),
      ),
      inheritance: plan.inheritance,
      sourceInheritance: plan.sourceState,
      targetInheritance: individual
        ? []
        : (
            [
              ["organization_name", "company_name"],
              ["organization_commercial_register", "commercial_register"],
            ] as const
          ).map(([purpose, source]) => {
            const own = plan.inheritance.find(
              (item) => item.fieldId === profile.fields[purpose],
            );
            const sourceField = bindings.find((f) => f.field_key === source)!;
            const visible =
              args.action === "new_organization" ||
              Boolean(
                organization &&
                policy.field(sourceField.id, organization.id).read,
              );
            return {
              fieldId: profile.fields[purpose],
              mode: own?.mode ?? "inherit",
              value:
                own?.mode === "own"
                  ? own.value
                  : visible
                    ? ((args.action === "new_organization"
                        ? organizationValues[name(source)]
                        : organization?.[name(source)]) as string | null)
                    : null,
            };
          }),
      organizationLabel: individual
        ? null
        : args.action === "new_organization"
          ? String(organizationValues[name("company_name")] ?? "")
          : String(
              (await contentAccess().project(args.objectTypeId, organization!))
                .keyword,
            ),
    });
  }
  // Hash complete source/model/edge snapshots; no raw retained values are exposed in the token.
  const previewToken = createHash("sha256")
    .update(
      JSON.stringify([
        contentAccess().actor,
        args,
        model,
        root,
        organization,
        sources,
        edges,
        definitions,
        plans,
      ]),
    )
    .digest("hex");
  const preview: ContactConversionPreview = {
    previewToken,
    action: args.action,
    changes,
    organizationValues,
    ...(organizationClassification ? { organizationClassification } : {}),
    issues,
    canExecute: !issues.length,
  };
  return { preview, plans, organization, membership, policy, model };
}
