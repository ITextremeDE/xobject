import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv';
import type { StandardSchemaWithJSON } from '@modelcontextprotocol/server';
import { schemas, type Operation } from './domain.js';
import { isReadOperation } from './operation-locks.js';

/** The REST contract is also the MCP output contract; publish only reachable definitions. */
export function mcpOutputSchemas(document: Record<string, any>): Record<Operation, StandardSchemaWithJSON> {
  const validator = new AjvJsonSchemaValidator();
  return Object.fromEntries(Object.keys(schemas).map(operation => {
    const definitions: Record<string, unknown> = {};
    function rewrite(value: any): any {
      if (Array.isArray(value)) return value.map(rewrite);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(Object.entries(value).map(([key, child]) => {
        if (key === '$ref' && typeof child === 'string' && child.startsWith('#/components/schemas/')) {
          const name = child.slice('#/components/schemas/'.length);
          if (!(name in definitions)) {
            definitions[name] = {}; // Mark before descending through recursive definitions.
            definitions[name] = rewrite(document.components.schemas[name]);
          }
          return [key, `#/$defs/${name}`];
        }
        return [key, rewrite(child)];
      }));
    }
    const root = rewrite(document.paths[`/api/v1/${operation}`].post.responses['200'].content['application/json'].schema);
    const json = { ...root, ...(Object.keys(definitions).length ? { $defs: definitions } : {}) };
    const validate = validator.getValidator(json);
    const schema: StandardSchemaWithJSON = { '~standard': {
      version: 1, vendor: 'xobject-openapi',
      jsonSchema: { input: () => json, output: () => json },
      validate: input => {
        const result = validate(input);
        // Never return record data or validator details through an internal contract failure.
        return result.valid ? { value: result.data } : { issues: [{ message: 'Response does not match the API contract' }] };
      },
    } };
    return [operation, schema];
  })) as Record<Operation, StandardSchemaWithJSON>;
}

const purposes: Record<Operation, string> = {
  list_oauth_authorizations:'List the current user’s authorized OAuth applications without tokens or secrets.',
  revoke_oauth_authorization:'Revoke the current user’s OAuth access/refresh tokens and consent for one application.',
  list_api_credentials: 'Inspect personal access-token metadata without revealing secrets.',
  create_api_credential: 'Issue one user-owned token; its secret is returned only once after password confirmation.',
  revoke_all_api_credentials: 'Revoke every access token owned by the selected user.',
  revoke_api_credential: 'Revoke one access token without deleting its audit metadata.',
  permanently_delete_record: 'Permanently remove a recycled record and live links after explicit confirmation; retain restricted immutable history.',
  list_deleted_records: 'List retained deletion identities/captions for an installation Administrator.',
  get_foreign_access_capabilities: 'Inspect which ownership/foreign-access settings the caller may manage.',
  get_foreign_access: 'Inspect the current workspace foreign-access rules and security version.',
  configure_foreign_access: 'Replace versioned foreign-access rules without assigning activity participants.',
  configure_group_inheritance: 'Configure graded nested group membership; cycles are rejected.',
  get_record_security: 'Inspect permitted ownership, privacy, maxima and field exceptions for a record.',
  configure_record_security: 'Apply versioned record-security changes; public widening requires confirmation.',
  recycle_record: 'Move a current record into the recycle bin while retaining its data, links and history.',
  restore_record: 'Restore a recycled record after current-definition, dependency and permission validation.',
  get_recycled_record: 'Inspect an authorized recycled record without enabling ordinary editing.',
  list_recycled_records: 'List authorized recycled records with filters, sorting and paging.',
  get_record_duplicate: 'Prepare an unsaved duplicate draft without allocating an ID, number or journal event.',
  duplicate_record: 'Immediately create a duplicate; prefer get_record_duplicate when the user wants to edit before saving.',
  configure_object_settings: 'Atomically edit object labels, sensitivity and supported settings using current model/security versions.',
  get_content_permissions: 'Inspect the administrative object/field permission ceilings and their version.',
  configure_content_permissions: 'Configure administrative permission ceilings; this does not assign record ownership.',
  list_access_principals: 'List eligible record owners from active workspace users/groups.',
  configure_form_layout: 'Configure the one common object form while retaining required fields and protected Contact cores.',
  get_relationship_tree_branch: 'Read a paginated Primary-only descendant branch while Projects is enabled.',
  list_record_link_options: 'Discover eligible object/relationship/side choices for existing linking or linked creation.',
  get_record_relationships: 'Read authorized current edges and relationship-field metadata for a record.',
  search_relationship_candidates: 'Search authorized link candidates with endpoint/cardinality/Primary constraints applied before paging.',
  activate_relationship_type: 'Activate a relationship definition after atomic preflight of existing records and edges.',
  get_primary_chain_context: 'Resolve the fixed Contact/Project/Case ancestry and current permitted selections.',
  list_workspace_modules: 'Inspect the installation catalog, workspace activation and contributed object identities.',
  configure_workspace_module: 'Activate/deactivate an available module atomically while retaining shared identities and authored forms.',
  list_relationship_types: 'List relationship definitions and their endpoint/cardinality configuration.',
  create_relationship_type: 'Define one custom object pair, direction, translated side labels and cardinality.',
  configure_relationship_type: 'Edit a versioned relationship definition after current-edge/dependency checks.',
  get_account_security: 'Inspect the current user’s interactive account/session security metadata.',
  change_password: 'Change the current local password after verification and revoke other sessions/tokens atomically.',
  revoke_session: 'Revoke one other interactive session owned by the current user.',
  revoke_other_sessions: 'Revoke all other interactive sessions owned by the current user.',
  set_definition_state: 'Change a field/object definition lifecycle state after dependency and storage preflight.',
  get_definition_journal: 'Read permitted per-property definition history.',
  get_access_context: 'Inspect whether the current account is an installation Administrator.',
  list_users: 'List available user references without returning credentials.',
  list_managed_users: 'List managed installation accounts for an Administrator.',
  create_user: 'Provision a local account with a mandatory first password change.',
  configure_user: 'Change account activation/Administrator status and invalidate access where required.',
  list_system_journal: 'Read paginated installation/account/security events as an Administrator.',
  list_workspace_members: 'Inspect workspace members and User/Designer roles.',
  set_workspace_member: 'Grant, change or remove a version-checked workspace membership.',
  create_workspace: 'Create a workspace with its unique readable technical code and current defaults.',
  get_workspace_navigation: 'Read effective workspace/personal navigation and inherited defaults.',
  configure_navigation: 'Save versioned workspace or personal navigation while preserving unavailable identities.',
  list_field_schemas: 'List installed typed structured-field codecs and translated labels.',
  get_language_catalog: 'List installed interface/definition languages.',
  get_time_zone_catalog: 'List supported named time zones.',
  configure_user_localization: 'Set personal language, zone and regional overrides, or inherit workspace defaults.',
  configure_workspace_languages: 'Configure versioned workspace language/zone/regional policy while retaining unavailable translations.',
  list_groups: 'List workspace groups with active state, membership and versions.',
  configure_group: 'Edit a group name and authorized graded membership using its current version.',
  set_group_active: 'Activate/deactivate a group while retaining historical references.',
  create_group: 'Create a named workspace group; role rules constrain membership management.',
  list_field_principals: 'List eligible user/group references for a field owner/context.',
  list_workspaces: 'List accessible workspaces with effective role, localization and appearance.',
  search_workspace: 'Search authorized object definitions and records without leaking hidden counts.',
  list_object_types: 'List workspace object metadata and current capabilities, with explicit lifecycle filters.',
  get_workspace_dashboard: 'Read authorized workspace counts and effective-zone daily activity.',
  list_workspace_records: 'List heterogeneous workspace records using the shared standard-column projection.',
  list_records: 'Search, filter, sort and page records of one object type with current visibility applied first.',
  create_object_type: 'Create a custom object definition with a readable technical name and optional standard fields.',
  add_standard_field: 'Add an absent Keyword, Type/Status pair or Category using reserved identities and shared rules.',
  create_field: 'Create one typed object/relationship field with translated labels, input aids and requiredness.',
  get_object_type: 'Read current fields, UUIDs, input aids, semantic bindings, form layout, capabilities and definition versions.',
  configure_field: 'Edit versioned field attributes; type conversions and stricter rules preflight existing values.',
  set_labels: 'Update translated definition labels using the current version.',
  set_workspace_name: 'Rename a workspace without changing its technical code or table identities.',
  set_workspace_appearance: 'Configure shared workspace design tokens using the current appearance version.',
  set_user_profile: 'Update the current user’s profile name without altering account security.',
  configure_classification: 'Configure Type/Status dependencies, Category choices, ordering, meanings and defaults.',
  create_record: 'Create a validated record, optionally from a duplicate draft or atomically linked to an existing source.',
  update_record: 'Atomically save record values, links and security using the current record version.',
  get_record: 'Read the currently permitted record projection and optimistic version.',
  list_record_journal: 'Read paginated per-field/link history under frozen-event and current rights; retained deleted history is Administrator-only.',
};

export function toolMetadata(operation: Operation) {
  const readOnly = isReadOperation(operation);
  const interactive = ['list_oauth_authorizations','revoke_oauth_authorization','create_api_credential','list_api_credentials','revoke_api_credential','revoke_all_api_credentials','change_password','get_account_security','revoke_session','revoke_other_sessions'].includes(operation);
  const description = `${purposes[operation]} ${readOnly
    ? 'Returns only data permitted to the current user; use returned IDs and follow pagination where provided.'
    : 'Changes persisted data as the current user. Read the current definition/record first, supply its optimistic version where required, and resolve conflicts by rereading before retrying.'}${interactive ? ' Requires an interactive browser session; unavailable to bearer-token agents.' : ''} Field IDs, input aids and capabilities come from current metadata; do not invent them.`;
  return { description, annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly,
    idempotentHint: readOnly, openWorldHint: false } };
}
