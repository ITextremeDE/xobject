import {tagFiltersSchema} from './tags.js';
export * from './tags.js';
export * from './error-codes.js';
export * from './contact-inheritance.js';
import {contactInheritanceWriteSchema,contactConversionSchema,type ContactInheritanceField,type ContactInheritanceWrite,type ContactConversionPreview,type ContactConversionResult} from './contact-workflows.js';
export * from './contact-workflows.js';
export * from './choice-tree.js';
export {objectIconKey,type RecordIconKey} from './record-icons.js';
import {navigationLayoutSchema,type NavigationSettings} from './navigation.js';
export * from './navigation.js';
export * from './temporal.js';
export * from './work-profile.js';
export * from './contact-profile.js';
export * from './structured-fields.js';
import {fieldInputRulesSchema,numberingSchema,type FieldInputRules,type Numbering} from './field-input-rules.js';
export * from './field-input-rules.js';
import {recordSecuritySchema,foreignRuleSchema,membershipSchema,type RecordSecurity,type ForeignSettings,type AccessExplanation} from './ownership.js';
export * from './ownership.js';
import {contentGrantSchema,type ContentPermissions,type ContentCapabilities,type FieldCapabilities} from './content-permissions.js';
export * from './content-permissions.js';
import {formLayoutSchema,type FormLayouts,type FormRelationship} from './form-layout.js';
export * from './form-layout.js';
export * from './identity.js';
import {uuidSchema} from './identity.js';
import {primaryRequirementsSchema,type PrimaryRequirements,primaryChainSchema,type PrimaryChain,type PrimaryChainContext} from './primary-chain.js';
export * from './primary-chain.js';
import { fieldApplicabilitySchema, type FieldApplicability } from './field-applicability.js';
export * from './field-applicability.js';
import {relationshipAttributeWritesSchema,linkedRecordSourceSchema, type RecordLinkOption, relationshipWritesSchema, type RecordRelationships, type RelatedRecord, type RelationshipTreeBranch } from './record-relationships.js';
export * from './record-relationships.js';
import { relationshipConfigurationSchema, customRelationshipConfigurationSchema, type WorkspaceModule, type RelationshipType } from './relationship-types.js';
export * from './relationship-types.js';
import { languageSchema as language, workspaceLanguageSchema, type Language, type WorkspaceLanguages } from './languages.js';
export * from './languages.js';
export * from './time-zones.js';
export * from './regional.js';
import { regionalSchema, personalRegionalSchema, type RegionalSettings, type PersonalRegionalSettings } from './regional.js';
import { timeZoneSchema } from './time-zones.js';
import { z } from 'zod';
import { workspaceAppearanceSchema, type WorkspaceAppearance } from './workspace-appearance.js';
export * from './workspace-appearance.js';
import { customFieldKindSchema, fieldConfigSchema, fieldValueSchema, type CustomFieldKind, type FieldConfig, type FieldValue, type FieldPrincipal } from './field-types.js';
export * from './field-types.js';
import { classificationRulesSchema, classificationValuesSchema, classificationFiltersSchema, type ClassificationConfig } from './classification.js';
export * from './classification.js';

const uuid = uuidSchema;
const label = z.string().trim().min(1).max(200);
const labels = z.partialRecord(language, label)
  .refine(value => Object.keys(value).length > 0, 'At least one translated label is required');
const technicalName = z.string().regex(/^[a-z][a-z0-9_]*$/).max(63);
const standardField = z.enum(['type_status', 'category', 'keyword','tags']);
const values = z.record(z.string(), fieldValueSchema).refine(value=>!Object.hasOwn(value,'access_principals'),'Use record security for Access principals').refine(
  (value) => Object.keys(value).length <= 100, 'At most 100 fields per write',
).describe('Field values keyed by each field technicalName from get_object_type, never by field UUID. Choice/reference values still use their discovered option/user/group IDs. Keyword, record_number, access_principals and derived fields are not writable through this map.');
const definitionState = z.enum(['active', 'inactive', 'deleted']);
const workspaceRole = z.enum(['user', 'designer']);
const recordSecurityWrite = z.object({policy:recordSecuritySchema,confirmPublic:z.boolean().default(false)}).strict();
export const schemas = {
  list_oauth_authorizations:z.object({}).strict(),
  revoke_oauth_authorization:z.object({clientId:z.string().min(1).max(2048)}).strict(),
  list_api_credentials:z.object({userId:z.string().min(1).max(100).optional()}).strict(),
  create_api_credential:z.object({name:z.string().trim().min(1).max(100),expiresAt:z.iso.datetime({offset:true}),channels:z.array(z.enum(['api','mcp'])).min(1).max(2).refine(items=>new Set(items).size===items.length),readOnly:z.boolean().default(false),currentPassword:z.string().min(1).max(128)}).strict(),
  revoke_all_api_credentials:z.object({userId:z.string().min(1).max(100).optional()}).strict(),
  revoke_api_credential:z.object({credentialId:uuid}).strict(),
  permanently_delete_record:z.object({objectTypeId:uuid,recordId:uuid,version:z.number().int().positive(),confirm:z.literal(true)}).strict(),
  list_deleted_records:z.object({workspaceId:uuid,objectTypeId:uuid.optional(),query:z.string().trim().max(200).default(''),sortBy:z.enum(['keyword','objectLabel','deletedAt','deletedByName']).default('deletedAt'),sortDirection:z.enum(['asc','desc']).default('desc'),limit:z.number().int().min(1).max(100).default(25),offset:z.number().int().min(0).default(0)}).strict(),

  get_foreign_access_capabilities:z.object({workspaceId:uuid}).strict(),
  get_foreign_access:z.object({workspaceId:uuid}).strict(),
  configure_foreign_access:z.object({workspaceId:uuid,version:z.number().int().positive(),rules:z.array(foreignRuleSchema).max(1000),users:z.array(z.object({userId:uuid,inherit:z.boolean(),manageOwn:z.boolean()}).strict()).max(1000)}).strict(),
  configure_group_inheritance:z.object({workspaceId:uuid,groupId:uuid,version:z.number().int().positive(),members:z.array(membershipSchema).max(1000)}).strict(),
  get_record_security:z.object({objectTypeId:uuid,recordId:uuid}).strict(),
  configure_record_security:z.object({objectTypeId:uuid,recordId:uuid,version:z.number().int().positive(),policy:recordSecuritySchema,confirmPublic:z.boolean().default(false)}).strict(),
  recycle_record:z.object({objectTypeId:uuid,recordId:uuid,version:z.number().int().positive()}).strict(),
  restore_record:z.object({objectTypeId:uuid,recordId:uuid,version:z.number().int().positive()}).strict(),
  get_recycled_record:z.object({objectTypeId:uuid,recordId:uuid}).strict(),
  list_recycled_records:z.object({workspaceId:uuid,objectTypeId:uuid.optional(),query:z.string().max(200).default(''),sortBy:z.enum(['record_number','keyword','objectLabel','recycled_at']).default('recycled_at'),sortDirection:z.enum(['asc','desc']).default('desc'),limit:z.number().int().min(1).max(100).default(25),offset:z.number().int().min(0).max(100000).default(0)}).strict(),
  get_record_duplicate:z.object({objectTypeId:uuid,recordId:uuid}).strict(),
  duplicate_record:z.object({objectTypeId:uuid,recordId:uuid,version:z.number().int().positive(),keyword:z.string().trim().max(200).optional()}).strict(),
  get_numbering_backfill_preview:z.object({objectTypeId:uuid,version:z.number().int().positive()}).strict(),
  backfill_record_numbers:z.object({objectTypeId:uuid,version:z.number().int().positive(),previewToken:z.string().regex(/^[a-f0-9]{64}$/),confirm:z.literal(true)}).strict(),
  configure_object_settings:z.object({objectTypeId:uuid,version:z.number().int().positive(),labels,numbering:numberingSchema.optional(),primaryRequirements:primaryRequirementsSchema.optional(),security:z.object({version:z.number().int().positive(),sensitive:z.boolean(),confirmWidening:z.boolean().default(false)}).strict().optional()}).strict(),
  get_content_permissions:z.object({objectTypeId:uuid}).strict(),
  configure_content_permissions:z.object({objectTypeId:uuid,version:z.number().int().positive(),sensitive:z.boolean(),confirmWidening:z.boolean().default(false),grants:z.array(contentGrantSchema).max(1000)}).strict(),
  list_access_principals:z.object({objectTypeId:uuid}).strict(),
  configure_form_layout: z.object({objectTypeId:uuid,version:z.number().int().positive(),layout:formLayoutSchema.nullable()}).strict(),
  get_relationship_tree_branch: z.object({objectTypeId:uuid,recordId:uuid,offset:z.number().int().min(0).default(0),limit:z.number().int().min(1).max(100).default(25)}).strict(),
  list_record_link_options:z.object({objectTypeId:uuid,recordId:uuid,sourceValues:z.record(z.string(),fieldValueSchema).optional()}).strict(),
  get_record_relationships: z.object({ objectTypeId: uuid, recordId: uuid.optional(),view:z.enum(['complete','summary']).optional() }).strict(),
  get_record_relationship_page:z.object({objectTypeId:uuid,recordId:uuid,entries:z.array(z.object({relationshipTypeId:uuid,side:z.enum(['left','right'])}).strict()).max(200).optional(),exclude:z.array(z.object({relationshipTypeId:uuid,side:z.enum(['left','right']),objectTypeId:uuid,recordId:uuid}).strict()).max(1000).default([]),query:z.string().max(200).default(''),targetObjectTypeId:uuid.optional(),sortBy:z.enum(['keyword','object','relationship','jobTitle','department','function','type','status','category']).default('keyword'),sortDirection:z.enum(['asc','desc']).default('asc'),limit:z.number().int().min(1).max(100).default(10),offset:z.number().int().min(0).default(0)}).strict(),
  search_relationship_candidates: z.object({primaryAncestor:z.object({objectTypeId:uuid,recordId:uuid}).strict().optional(),sourceValues:z.record(z.string(),fieldValueSchema).optional(), targetObjectTypeId: uuid.optional(), objectTypeId: uuid, recordId: uuid.optional(), relationshipTypeId: uuid, side: z.enum(['left','right']), query: z.string().trim().max(200).default(''), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(100).default(30) }).strict(),
  activate_relationship_type: z.object({ workspaceId: uuid, relationshipTypeId: uuid, version: z.number().int().positive() }).strict(),
  get_primary_chain_context: z.object({objectTypeId:uuid,recordId:uuid.optional(),parent:z.object({objectTypeId:uuid,recordId:uuid}).strict().nullable().optional()}).strict(),
  list_workspace_modules: z.object({workspaceId:uuid}).strict(),
  configure_workspace_module: z.object({workspaceId:uuid,key:z.enum(['contacts','projects','documents']),enabled:z.boolean(),version:z.number().int().positive()}).strict(),
  list_relationship_types: z.object({ workspaceId: uuid }).strict(),
  create_relationship_type: z.object({ workspaceId: uuid, technicalName, configuration: customRelationshipConfigurationSchema }).strict(),
  configure_relationship_type: z.object({ workspaceId: uuid, relationshipTypeId: uuid, version: z.number().int().positive(), configuration: relationshipConfigurationSchema }).strict(),
  get_account_security: z.object({}).strict(),
  change_password: z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(12).max(128), revokeOtherSessions: z.boolean().default(true) }).strict(),
  revoke_session: z.object({ sessionId: uuid }).strict(),
  revoke_other_sessions: z.object({}).strict(),
  set_definition_state: z.object({ kind: z.enum(['object_type', 'field']), id: uuid, expectedState: z.enum(['active', 'inactive']), state: definitionState, confirm: z.boolean().default(false) }).strict(),
  get_definition_journal: z.object({ objectTypeId: uuid }).strict(),
  get_access_context: z.object({}).strict(),
  list_users: z.object({}).strict(),
  list_managed_users: z.object({}).strict(),
  create_user: z.object({ name: label, email: z.email().max(254).transform(value => value.toLowerCase()), initialPassword: z.string().min(12).max(128) }).strict(),
  configure_user: z.object({ userId: uuid, version: z.number().int().positive(), name: label, active: z.boolean(), isAdmin: z.boolean() }).strict(),
  list_system_journal: z.object({ workspaceId: uuid.optional(), fieldKey: z.string().max(200).default(''), entityKind: z.string().max(100).default(''), limit: z.number().int().min(1).max(100).default(25), offset: z.number().int().min(0).max(1000000).default(0) }).strict(),
  list_workspace_members: z.object({ workspaceId: uuid }).strict(),
  set_workspace_member: z.object({ workspaceId: uuid, userId: uuid, role: workspaceRole.nullable(), expectedRole: workspaceRole.nullable() }).strict(),
  create_workspace: z.object({ name: label, code: z.string().regex(/^[a-z][a-z0-9]*$/).max(61), defaultLanguage: language.default('en'), timeZone: timeZoneSchema.default('UTC'), regional: regionalSchema.optional() }).strict(),
  get_workspace_navigation:z.object({workspaceId:uuid}).strict(),
  configure_navigation:z.object({workspaceId:uuid,scope:z.enum(['workspace','personal']),version:z.number().int().nonnegative(),layout:navigationLayoutSchema.nullable()}).strict(),
  list_field_schemas: z.object({}).strict(),
  get_language_catalog: z.object({}).strict(),
  get_time_zone_catalog: z.object({}).strict(),
  configure_user_localization: z.object({ language: language.nullable(), timeZone: timeZoneSchema.nullable(), expectedLanguage: language.nullable(), expectedTimeZone: timeZoneSchema.nullable(), regional: personalRegionalSchema.optional(), expectedRegional: personalRegionalSchema.nullable().optional() }).strict().refine(args => args.regional === undefined || args.expectedRegional !== undefined, 'Expected regional settings required'),
  configure_workspace_languages: workspaceLanguageSchema.safeExtend({ workspaceId: uuid, version: z.number().int().positive(), timeZone: timeZoneSchema.optional(), regional: regionalSchema.optional() }),
  list_groups: z.object({ workspaceId: uuid }).strict(),
  configure_group: z.object({ workspaceId: uuid, groupId: uuid, version: z.number().int().positive(), name: label,members:z.array(membershipSchema).max(1000).optional() }).strict(),
  set_group_active: z.object({ workspaceId: uuid, groupId: uuid, version: z.number().int().positive(), active: z.boolean() }).strict(),
  create_group: z.object({ workspaceId: uuid, name: label, members:z.array(membershipSchema).max(1000).default([]) }).strict(),
  list_field_principals: z.object({ workspaceId: uuid }).strict(),
  list_workspaces: z.object({}).strict(),
  search_workspace: z.object({ workspaceId: uuid, query: z.string().trim().min(2).max(200), limit: z.number().int().min(1).max(50).default(20) }).strict(),
  list_object_types: z.object({ workspaceId: uuid, includeInactive: z.boolean().default(false), includeDeleted: z.boolean().default(false) }).strict(),
  get_workspace_dashboard: z.object({ workspaceId: uuid, days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(90) }).strict(),
  list_workspace_records: z.object({ workspaceId: uuid, objectTypeId: uuid.optional(), query: z.string().max(200).default(''), sortBy: z.enum(['record_number','keyword', 'objectLabel', 'type', 'status', 'category', 'created_at', 'updated_at', 'createdByName', 'updatedByName', 'version']).default('updated_at'), sortDirection: z.enum(['asc', 'desc']).default('desc'), limit: z.number().int().min(1).max(100).default(10), offset: z.number().int().min(0).max(100000).default(0) }).strict(),
  list_field_tags:z.object({objectTypeId:uuid,fieldId:uuid,query:z.string().max(200).default(''),limit:z.number().int().min(1).max(100).default(100)}).strict(),
  list_records: z.object({ tagFilters:tagFiltersSchema.default([]), objectTypeId: uuid, classificationFilters:classificationFiltersSchema.default({}), contactKindId:uuid.optional(), query: z.string().max(200).default(''), sortBy: technicalName.default('updated_at'), sortDirection: z.enum(['asc', 'desc']).default('desc'), limit: z.number().int().min(1).max(100).default(25), offset: z.number().int().min(0).max(100000).default(0) }).strict(),
  create_object_type: z.object({ workspaceId: uuid, technicalName, labels, standardFields: z.array(standardField).max(4).refine(items => new Set(items).size === items.length, 'Duplicate standard fields').default([]) }).strict(),
  add_standard_field: z.object({ inputRules:fieldInputRulesSchema.optional(),objectTypeId: uuid, field: standardField, required: z.boolean().optional(), configuration: z.object({ version: z.number().int().positive(), config: classificationRulesSchema }).strict().optional() }).strict().refine(args => ['keyword','tags'].includes(args.field) ? args.configuration === undefined : args.required === undefined, 'Configuration must match the standard field kind'),
  create_field: z.object({ inputRules:fieldInputRulesSchema.optional(),objectTypeId: uuid.optional(),relationshipTypeId:uuid.optional(), applicability: fieldApplicabilitySchema.optional(), technicalName, labels, kind: customFieldKindSchema.default('text'), config: fieldConfigSchema.optional(), required: z.boolean().default(false) }).strict().refine(v=>Boolean(v.objectTypeId)!==Boolean(v.relationshipTypeId),'Exactly one field owner is required'),
  get_object_type: z.object({ objectTypeId: uuid }).strict(),
  configure_field: z.object({ inputRules:fieldInputRulesSchema.optional(),fieldId: uuid, applicability: fieldApplicabilitySchema.optional(), version: z.number().int().positive(), labels: labels.optional(), kind: customFieldKindSchema.optional(), config: fieldConfigSchema.optional(), required: z.boolean() }).strict(),
  set_labels: z.object({ kind: z.enum(['object_type', 'field']), id: uuid, version: z.number().int().positive(), labels }).strict(),
  set_workspace_name: z.object({ workspaceId: uuid, name: label }).strict(),
  set_workspace_appearance: z.object({ workspaceId: uuid, version: z.number().int().positive(), appearance: workspaceAppearanceSchema }).strict(),
  set_user_profile: z.object({ name: label }).strict(),
  configure_classification: z.object({ fieldInputRules:z.array(z.object({fieldId:uuid,version:z.number().int().positive(),inputRules:fieldInputRulesSchema}).strict()).max(3).refine(items=>new Set(items.map(item=>item.fieldId)).size===items.length,'Field IDs must be unique').optional(),objectTypeId: uuid, version: z.number().int().positive(), config: classificationRulesSchema }).strict(),
  get_contact_conversion_preview:contactConversionSchema,
  convert_contact:contactConversionSchema.extend({previewToken:z.string().regex(/^[a-f0-9]{64}$/),confirm:z.literal(true)}).strict(),
  create_record: z.object({requestId:uuid.optional().describe("Optional creation retry key, scoped to the current user. Reuse with identical input for up to seven days; retries return the current permitted record."),contactInheritance:contactInheritanceWriteSchema.optional(), objectTypeId: uuid, duplicateFrom:z.object({recordId:uuid,version:z.number().int().positive()}).strict().optional(), keyword: z.string().trim().max(200).optional(), values: values.default({}), classification: classificationValuesSchema.default({}), relationshipAttributes:relationshipAttributeWritesSchema.optional(),relationships: relationshipWritesSchema.optional(),linkFrom:linkedRecordSourceSchema.optional(),security:recordSecurityWrite.optional() }).strict(),
  update_record: z.object({contactInheritance:contactInheritanceWriteSchema.optional(), security:recordSecurityWrite.optional(), objectTypeId: uuid, recordId: uuid, version: z.number().int().positive(), keyword: z.string().trim().max(200).optional(), values: values.default({}), classification: classificationValuesSchema.default({}), relationships: relationshipWritesSchema.optional(),relationshipAttributes:relationshipAttributeWritesSchema.optional() }).strict(),
  get_record: z.object({ objectTypeId: uuid, recordId: uuid }).strict(),
  list_record_journal: z.object({includeDeleted:z.boolean().default(false),includeRecycled:z.boolean().default(false),objectTypeId:uuid,recordId:uuid,fieldId:uuid.optional(),entityKind:z.enum(['record','relationship']).optional(),limit:z.number().int().min(1).max(100).default(10),offset:z.number().int().min(0).max(1000000).default(0)}).strict(),
};
export type Operation = keyof typeof schemas;

export type Labels = Record<string, string>;
export interface Workspace { id: string; code: string; name: string; default_language: Language; available_languages: Language[]; label_languages: Language[]; language_version: number; time_zone: string; regional: RegionalSettings; created_by: string; created_by_name: string; created_at: string; appearance: WorkspaceAppearance; appearance_version: number; role: 'administrator' | 'designer' | 'user' }
export type DefinitionState = 'active' | 'inactive' | 'deleted';
export interface ObjectSummary { iconKey?:import('./record-icons.js').RecordIconKey; permissions?:ContentCapabilities; state?: DefinitionState; isProtected?: boolean; canDelete?: boolean; id: string; technicalName: string; labels: Labels; label: string }
export interface FieldDefinition extends ObjectSummary {relationshipTypeId?:string; isDerived?:boolean; inputRules?:FieldInputRules;description?:string;helpText?:string; fieldPermissions?:FieldCapabilities; applicability?: FieldApplicability; version: number; kind: CustomFieldKind | 'type' | 'status' | 'category'; required: boolean; config: FieldConfig }
export interface ObjectDefinition extends ObjectSummary {primaryRequirements:PrimaryRequirements;primaryChain:PrimaryChain|null;activity?:boolean;moduleKeys?:string[];moduleFieldIds?:Record<string,string[]>;relationshipFields?:FieldDefinition[];workProfile?:import('./work-profile.js').WorkProfile; contactProfile?:import('./contact-profile.js').ContactProfile;numbering?:Numbering; permissionsVersion?:number;sensitive?:boolean; formLayouts?: FormLayouts; formRelationships?:FormRelationship[]; version: number; workspaceId: string; classification: ClassificationConfig; fields: FieldDefinition[]; historicalFields?: FieldDefinition[]; columns: string[] }
export interface NumberingBackfillPreview {objectTypeId:string;version:number;previewToken:string;eligibleCount:number;preservedCount:number;recycledCount:number;period:string;firstNumber:string|null;lastNumber:string|null;samples:{recordId:string;number:string}[]}
export interface DataRecord {contactInheritance?:ContactInheritanceField[];suggestedLetterSalutation?:string|null; effectiveLetterSalutation?:string|null; iconKey?:import('./record-icons.js').RecordIconKey; fieldAccess?:Record<string,FieldCapabilities>; access?:AccessExplanation; applicableFieldIds?:string[];allowedStatusIds?:string[]; permissions?:ContentCapabilities; id: string; keyword: string; version: number; created_at: string; created_by: string; updated_at: string; updated_by: string; type?: string | null; status?: string | null; category?: string[]; [field: string]: ContactInheritanceField[] | FieldValue | number | ContentCapabilities | Record<string,FieldCapabilities> | AccessExplanation | undefined }
/** A successful write may retain only this receipt if the actor cannot read the resulting record. */
export interface HiddenRecordReceipt {id:string;version:number;keyword:string;permissions:ContentCapabilities & {read:false}}
export type RecordWriteResult=DataRecord|HiddenRecordReceipt;
export function isReadableRecord(record:RecordWriteResult):record is DataRecord{return 'created_at' in record&&record.permissions?.read!==false;}
export interface RecordPage { records: DataRecord[]; total: number; limit: number; offset: number }
export interface SearchRecord { iconKey?:import('./record-icons.js').RecordIconKey; recordNumber: string|null; id: string; keyword: string; objectTypeId: string; objectLabel: string }
export interface WorkspaceSearch { objectTypes: ObjectSummary[]; records: SearchRecord[]; hasMoreObjects: boolean; hasMoreRecords: boolean }
export interface JournalEntry {credential_context?:{name:string;userId:string;userName:string}; access_channel?:string; credential_id?:string|null; agent_name?:string|null; detail_context?:{valueContext?:{kind:string;config:FieldConfig};schema:string;changes:{entryId?:string;path:string}[]}|null; security_context?: {principals:Record<string,string>}; form_layout_context?: {fields:Record<string,string>;relationships:Record<string,{left:string;right:string}>}; value_context?: { before: {kind:string;config:FieldConfig}|null; after: {kind:string;config:FieldConfig}|null }; field_label?: string | null; object_type_name?: string | null; entity_kind?: string; entity_id?: string; workspace_id?: string | null; workspace_name?: string | null; actor_name?: string | null; entity_name?: string | null; id: string; change_id: string; field_id: string | null; field_key: string; old_value: unknown; new_value: unknown; created_at: string; actor_id: string }
export interface AuthUser { id: string; name: string; email: string; language?: Language | null; timeZone?: string | null; regionalPreferences?: PersonalRegionalSettings | null; mustChangePassword?: boolean; isAdmin?: boolean }
export type Inputs = { [K in Operation]: z.input<(typeof schemas)[K]> };
export interface WorkspaceGroup { id: string; workspaceId: string; name: string; active: boolean; version: number; members:import('./ownership.js').GradedMember[] }
export interface WorkspaceMember { active:boolean; id: string; name: string; email: string; role: 'administrator' | 'designer' | 'user' }
export interface UserSummary { active:boolean; id: string; name: string; email: string; isAdmin: boolean }
export interface AccountSession { id: string; current: boolean; createdAt: string; updatedAt: string; expiresAt: string; ipAddress: string | null; userAgent: string | null }
export interface AccountSecurity { hasPassword: boolean; sessions: AccountSession[] }
export interface ManagedUser extends UserSummary { active: boolean; mustChangePassword: boolean; version: number }
export interface SystemJournalEntry extends JournalEntry { entity_kind: string; entity_id: string; workspace_id: string | null; workspace_name: string | null; actor_name: string; entity_name: string | null }
export interface RecycledRecord extends WorkspaceRecord {recycled_at:string;recycled_by:string;recycledByName:string;canRestore:boolean}
export interface WorkspaceRecord { iconKey?:import('./record-icons.js').RecordIconKey; record_number?:string|null; id: string; objectTypeId: string; objectTechnicalName: string; objectLabel: string; keyword: string | null; type: string | null; status: string | null; category: string | null; created_at: string; updated_at: string; created_by: string; updated_by: string; createdByName: string; updatedByName: string; version: number }
export interface Outputs {
  list_oauth_authorizations:{clientId:string;name:string;scopes:string[];createdAt:string}[];
  revoke_oauth_authorization:{revoked:boolean};
  list_api_credentials:ApiCredential[];
  create_api_credential:{credential:ApiCredential;token:string};
  revoke_all_api_credentials:{revokedCredentials:number};
  revoke_api_credential:{revoked:boolean};
  permanently_delete_record:{id:string;deleted:true};
  list_deleted_records:{records:DeletedRecord[];total:number;limit:number;offset:number};

  get_foreign_access_capabilities:{manageOwn:boolean};
  get_foreign_access:ForeignSettings;
  configure_foreign_access:ForeignSettings;
  configure_group_inheritance:WorkspaceGroup;
  get_record_security:{policy:RecordSecurity;version:number;effective:AccessExplanation;canManage:boolean;principals:(FieldPrincipal&{assignable:boolean})[];fieldAccess:Record<string,FieldCapabilities>};
  configure_record_security:RecordWriteResult;
  recycle_record:{id:string;version:number};
  restore_record:{id:string;version:number};
  get_recycled_record:DataRecord;
  list_recycled_records:{records:RecycledRecord[];total:number;limit:number;offset:number};
  get_record_duplicate:{contactInheritance?:ContactInheritanceWrite;sourceVersion:number;keyword?:string;values:Record<string,FieldValue>;classification:{type?:string|null;status?:string|null;category?:string[]}};
  duplicate_record:RecordWriteResult;
  get_numbering_backfill_preview:NumberingBackfillPreview;
  backfill_record_numbers:{assigned:number;preserved:number;firstNumber:string|null;lastNumber:string|null};
  configure_object_settings:ObjectDefinition;
  get_content_permissions:ContentPermissions;
  configure_content_permissions:ContentPermissions;
  list_access_principals:FieldPrincipal[];
  get_relationship_tree_branch: RelationshipTreeBranch;
  list_record_link_options:RecordLinkOption[];
  get_record_relationships: RecordRelationships;
  list_field_tags:{values:string[];hasMore:boolean};
  get_record_relationship_page:{entries:import('./record-relationships.js').DossierEntry[];total:number;objects:{id:string;label:string}[];limit:number;offset:number};
  search_relationship_candidates: { records: RelatedRecord[]; total: number; limit: number; offset: number };
  activate_relationship_type: RelationshipType;
  get_primary_chain_context: PrimaryChainContext;
  list_workspace_modules: WorkspaceModule[];
  configure_workspace_module: WorkspaceModule;
  list_relationship_types: RelationshipType[];
  create_relationship_type: RelationshipType;
  configure_relationship_type: RelationshipType;
  get_workspace_dashboard: { total: number; objectTypes: number; created30: number; updated7: number; timeZone: string; activity: { date: string; created: number; updated: number }[] };
  list_workspace_records: { records: WorkspaceRecord[]; total: number; limit: number; offset: number };
  list_managed_users: ManagedUser[];
  create_user: ManagedUser;
  configure_user: ManagedUser;
  list_system_journal: { entries: SystemJournalEntry[]; total: number; limit: number; offset: number };
  get_account_security: AccountSecurity;
  change_password: { changed: boolean; revokedSessions: number };
  revoke_session: { revokedSessions: number };
  revoke_other_sessions: { revokedSessions: number };
  set_definition_state: { id: string; state: DefinitionState };
  get_definition_journal: JournalEntry[];
  get_access_context: { user: { id: string; name: string }; isAdmin: boolean };
  list_users: UserSummary[];
  list_workspace_members: WorkspaceMember[];
  set_workspace_member: { workspaceId: string; userId: string; role: 'user' | 'designer' | null };
  create_workspace: { id: string };
  get_time_zone_catalog: string[];
  configure_user_localization: { language: Language | null; timeZone: string | null; regional: PersonalRegionalSettings | null };
  get_workspace_navigation:NavigationSettings;
  configure_navigation:NavigationSettings;
  list_field_schemas: {key:import('./structured-fields.js').StructuredSchemaKey;labels:{en:string;de:string}}[];
  get_language_catalog: { code: Language; nativeName: string; interfaceAvailable: boolean }[];
  configure_workspace_languages: WorkspaceLanguages & { workspaceId: string; version: number; timeZone: string; regional: RegionalSettings };
  list_groups: WorkspaceGroup[];
  configure_group: WorkspaceGroup;
  set_group_active: WorkspaceGroup;
  create_group: WorkspaceGroup;
  list_field_principals: FieldPrincipal[];
  list_workspaces: Workspace[];
  list_object_types: ObjectSummary[];
  search_workspace: WorkspaceSearch;
  list_records: RecordPage;
  create_object_type: { id: string };
  add_standard_field: ObjectDefinition;
  create_field: { id: string };
  get_object_type: ObjectDefinition;
  configure_field: ObjectDefinition|FieldDefinition;
  set_labels: { id: string; kind: string; labels: Labels; version: number };
  set_workspace_name: { workspaceId: string; name: string };
  set_workspace_appearance: { workspaceId: string; appearance: WorkspaceAppearance; version: number };
  set_user_profile: { name: string };
  configure_classification: ObjectDefinition;
  configure_form_layout: ObjectDefinition;
  get_contact_conversion_preview:ContactConversionPreview;
  convert_contact:ContactConversionResult;
  create_record: RecordWriteResult;
  update_record: RecordWriteResult;
  get_record: DataRecord;
  list_record_journal: {entries:JournalEntry[];total:number;limit:number;offset:number};
}

const reservedStandardFieldNames = new Set(['record_number','record number','datensatznummer','number','nummer','access_principals','access principals','zugriffsberechtigte','tags','tag','schlagworte','schlagwörter','keyword', 'stichwort', 'type', 'typ', 'status', 'category', 'kategorie']);
export function isReservedStandardFieldName(value: string) { return reservedStandardFieldNames.has(value.normalize('NFKC').trim().toLowerCase()); }
export function hasReservedStandardFieldLabel(labels: Record<string, string>) { return Object.values(labels).some(isReservedStandardFieldName); }

export interface ApiCredential {id:string;userId:string;name:string;channels:('api'|'mcp')[];readOnly:boolean;createdAt:string;expiresAt:string;lastUsedAt:string|null;revokedAt:string|null}
export interface DeletedRecord {keyword:string;id:string;objectTypeId:string;objectLabel:string;deletedAt:string;deletedByName:string}
export * from './api-version.js';
