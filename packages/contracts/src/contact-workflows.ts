import { classificationValuesSchema } from "./classification.js";
import { z } from "zod";
import { uuidSchema as uuid } from "./identity.js";
import { fieldValueSchema, type FieldValue } from "./field-types.js";
export const contactInheritanceWriteSchema = z
  .array(
    z.discriminatedUnion("mode", [
      z
        .object({
          fieldId: uuid,
          mode: z.literal("own"),
          value: z.string().trim().max(10000).nullable(),
        })
        .strict(),
      z
        .object({
          fieldId: uuid,
          mode: z.literal("inherit"),
          confirmReset: z.boolean().optional(),
        })
        .strict(),
    ]),
  )
  .max(2)
  .refine(
    (items) => new Set(items.map((i) => i.fieldId)).size === items.length,
    "Duplicate inheritance field",
  );
export type ContactInheritanceWrite = z.infer<
  typeof contactInheritanceWriteSchema
>;
export interface ContactInheritanceField {
  fieldId: string;
  mode: "inherit" | "own";
  value: string | null;
  inheritedValue: string | null;
  canEdit: boolean;
  source?: { recordId: string; version: number; keyword: string };
}
const conversionValues = z
  .record(z.string(), fieldValueSchema)
  .refine(
    (values) => Object.keys(values).length <= 100,
    "At most 100 fields per conversion patch",
  );
export const contactConversionSchema = z
  .object({
    objectTypeId: uuid,
    recordId: uuid,
    version: z.number().int().positive(),
    action: z.enum([
      "new_organization",
      "existing_organization",
      "individual",
      "dissolve_organization",
    ]),
    organizationId: uuid.optional(),
    organizationValues: conversionValues.default({}),
    organizationClassification: classificationValuesSchema.default({}),
    contactValues: z
      .record(uuid, conversionValues)
      .refine(
        (values) => Object.keys(values).length <= 1000,
        "At most 1000 Contact patches",
      )
      .default({}),
  })
  .strict();
export interface ContactConversionChange {
  recordId: string;
  keyword: string;
  targetKeyword: string;
  version: number;
  from: string;
  to: string;
  values: Record<string, FieldValue>;
  beforeValues: Record<string, FieldValue>;
  inheritance: ContactInheritanceWrite;
  organizationLabel: string | null;
  sourceInheritance: ContactInheritanceField[];
  targetInheritance: {
    fieldId: string;
    mode: "own" | "inherit";
    value: string | null;
  }[];
}
export interface ContactConversionPreview {
  previewToken: string;
  action: z.infer<typeof contactConversionSchema>["action"];
  changes: ContactConversionChange[];
  organizationValues: Record<string, FieldValue>;
  organizationClassification?: {
    type: string | null;
    status: string | null;
    category: string[];
  };
  issues: { code: string; recordId?: string; fieldId?: string }[];
  canExecute: boolean;
}
export interface ContactConversionResult {
  records: import("./index.js").DataRecord[];
  organization?: import("./index.js").DataRecord;
}
