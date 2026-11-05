-- Current unreleased xObject application schema. Fresh installations only.
-- Authentication tables are created by the pinned Better Auth schema API.
ALTER TABLE public.sys_users ADD COLUMN active boolean NOT NULL DEFAULT true, ADD COLUMN management_version integer NOT NULL DEFAULT 1 CHECK (management_version > 0);

CREATE FUNCTION public.sys_assert_record_identity(ws uuid, obj uuid, rec uuid) RETURNS void
    LANGUAGE plpgsql
    AS $_$
  DECLARE physical_name text; registered boolean; present boolean; sensitive boolean; removed boolean;
  BEGIN
    SELECT w.code || '_' || o.technical_name INTO physical_name FROM sys_object_types o JOIN sys_workspaces w ON w.id=o.workspace_id WHERE o.id=obj AND o.workspace_id=ws AND o.state<>'deleted';
    PERFORM 1 FROM sys_record_identities WHERE workspace_id=ws AND object_type_id=obj AND record_id=rec FOR KEY SHARE;
    registered := FOUND;
    SELECT deleted_at IS NOT NULL INTO removed FROM sys_record_identities WHERE workspace_id=ws AND object_type_id=obj AND record_id=rec;
    present := false;
    IF physical_name IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM (SELECT id FROM %I WHERE id=$1 FOR KEY SHARE) r)',physical_name) INTO present USING rec;
    END IF;
    SELECT is_sensitive INTO sensitive FROM public.sys_object_types WHERE id=obj;
    IF present AND sensitive AND NOT EXISTS(SELECT 1 FROM public.sys_record_security WHERE object_type_id=obj AND record_id=rec) THEN RAISE EXCEPTION 'Sensitive record requires a security policy' USING ERRCODE='23503'; END IF;
    IF removed THEN
      IF present OR EXISTS(SELECT 1 FROM sys_relationships WHERE workspace_id=ws AND ((left_object_type_id=obj AND left_record_id=rec) OR (right_object_type_id=obj AND right_record_id=rec))) THEN RAISE EXCEPTION 'Deleted identity cannot have live contents or edges' USING ERRCODE='23503'; END IF;
    ELSIF registered <> present THEN RAISE EXCEPTION 'Record identity and business row must exist together' USING ERRCODE='23503'; END IF;
  END $_$;

CREATE FUNCTION public.sys_check_business_identity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  BEGIN
    IF TG_OP='UPDATE' AND OLD.id=NEW.id THEN RETURN NULL; END IF;
    IF TG_OP <> 'INSERT' THEN PERFORM sys_assert_record_identity(TG_ARGV[0]::uuid,TG_ARGV[1]::uuid,OLD.id); END IF;
    IF TG_OP <> 'DELETE' THEN PERFORM sys_assert_record_identity(TG_ARGV[0]::uuid,TG_ARGV[1]::uuid,NEW.id); END IF;
    RETURN NULL;
  END $$;

CREATE FUNCTION public.sys_check_registry_identity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  BEGIN
    IF TG_OP <> 'INSERT' THEN PERFORM sys_assert_record_identity(OLD.workspace_id,OLD.object_type_id,OLD.record_id); END IF;
    IF TG_OP <> 'DELETE' THEN PERFORM sys_assert_record_identity(NEW.workspace_id,NEW.object_type_id,NEW.record_id); END IF;
    RETURN NULL;
  END $$;

CREATE TABLE public.sys_api_credentials (
    id uuid PRIMARY KEY,
    user_id text NOT NULL REFERENCES public.sys_users(id) ON DELETE RESTRICT,
    name text NOT NULL,
    secret_hash text NOT NULL CHECK (secret_hash ~ '^[0-9a-f]{64}$'),
    channels text[] NOT NULL CHECK (cardinality(channels)>0 AND channels <@ ARRAY['api','mcp']::text[]),
    read_only boolean NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    last_used_at timestamptz,
    revoked_at timestamptz,
    CHECK (expires_at > created_at)
);
CREATE INDEX sys_api_credentials_user_idx ON public.sys_api_credentials(user_id,created_at DESC);

CREATE TABLE public.sys_content_grants (
    object_type_id uuid NOT NULL,
    principal_kind text NOT NULL,
    principal_id text NOT NULL,
    level text,
    can_create boolean,
    fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT sys_content_grants_fields_check CHECK ((jsonb_typeof(fields) = 'object'::text)),
    CONSTRAINT sys_content_grants_level_check CHECK ((level = ANY (ARRAY['none'::text, 'availability'::text, 'read'::text, 'duplicate'::text, 'schedule'::text, 'edit'::text, 'delete'::text, 'full'::text]))),
    CONSTRAINT sys_content_grants_principal_kind_check CHECK ((principal_kind = ANY (ARRAY['user'::text, 'group'::text])))
);

CREATE TABLE public.sys_fields (
    id uuid NOT NULL,
    object_type_id uuid,
    relationship_type_id uuid,
    CONSTRAINT sys_fields_owner_check CHECK ((object_type_id IS NULL) <> (relationship_type_id IS NULL)),
    technical_name text NOT NULL,
    labels jsonb NOT NULL,
    kind text NOT NULL,
    value_mode text NOT NULL DEFAULT 'stored' CHECK(value_mode IN ('stored','derived')),
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    input_rules jsonb DEFAULT '{"description":{},"helpText":{},"defaultValue":null,"unique":false}'::jsonb NOT NULL,
    applicability jsonb,
    required boolean DEFAULT false NOT NULL,
    is_protected boolean DEFAULT false NOT NULL,
    state text DEFAULT 'active'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT sys_fields_kind_check CHECK ((kind = ANY (ARRAY['structured'::text, 'text'::text, 'multiline'::text, 'integer'::text, 'decimal'::text, 'money'::text, 'boolean'::text, 'date'::text, 'datetime'::text, 'single_choice'::text, 'multiple_choice'::text, 'email'::text, 'phone'::text, 'url'::text, 'reference'::text, 'type'::text, 'status'::text, 'category'::text]))),
    CONSTRAINT sys_fields_state_check CHECK ((state = ANY (ARRAY['active'::text, 'inactive'::text, 'deleted'::text]))),
    CONSTRAINT sys_fields_version_check CHECK ((version > 0))
);

CREATE TABLE public.sys_foreign_access (
    workspace_id uuid NOT NULL,
    rules jsonb DEFAULT '[]'::jsonb NOT NULL,
    users jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT sys_foreign_access_rules_check CHECK ((jsonb_typeof(rules) = 'array'::text)),
    CONSTRAINT sys_foreign_access_users_check CHECK ((jsonb_typeof(users) = 'array'::text))
);

CREATE TABLE public.sys_group_members (
    group_id uuid NOT NULL,
    user_id text NOT NULL,
    level text DEFAULT 'full'::text NOT NULL,
    CONSTRAINT sys_group_members_level_check CHECK ((level = ANY (ARRAY['read'::text, 'duplicate'::text, 'schedule'::text, 'edit'::text, 'delete'::text, 'full'::text])))
);

CREATE TABLE public.sys_group_nesting (
    group_id uuid NOT NULL,
    member_group_id uuid NOT NULL,
    level text NOT NULL,
    CONSTRAINT sys_group_nesting_check CHECK ((group_id <> member_group_id)),
    CONSTRAINT sys_group_nesting_level_check CHECK ((level = ANY (ARRAY['read'::text, 'duplicate'::text, 'schedule'::text, 'edit'::text, 'delete'::text, 'full'::text])))
);

CREATE TABLE public.sys_groups (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT sys_groups_version_check CHECK ((version > 0))
);

CREATE TABLE public.sys_journal (
    id uuid NOT NULL,
    change_id uuid NOT NULL,
    workspace_id uuid,
    object_type_id uuid,
    entity_kind text NOT NULL,
    entity_id uuid NOT NULL,
    field_id uuid,
    field_key text NOT NULL,
    access_channel text NOT NULL DEFAULT COALESCE(NULLIF(current_setting('xobject.channel',true),''),'internal'),
    credential_id uuid DEFAULT NULLIF(current_setting('xobject.credential_id',true),'')::uuid,
    agent_name text DEFAULT NULLIF(current_setting('xobject.agent_name',true),''),
    detail_context jsonb,
    old_value jsonb,
    new_value jsonb,
    actor_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sys_module_object_bindings (
    workspace_id uuid NOT NULL,
    object_key text NOT NULL,
    object_type_id uuid NOT NULL
);

CREATE TABLE public.sys_modules (
    key text NOT NULL,
    template_version integer NOT NULL DEFAULT 1 CHECK(template_version>0),
    labels jsonb NOT NULL,
    description jsonb NOT NULL,
    objects jsonb NOT NULL,
    available boolean NOT NULL,
    "position" integer NOT NULL
);

CREATE TABLE public.sys_object_types (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    technical_name text NOT NULL,
    labels jsonb NOT NULL,
    classification jsonb DEFAULT '{"type": {"required": false, "defaultId": null}, "status": {"defaults": [], "required": false}, "options": [], "version": 1, "category": {"multiple": false, "required": false, "defaultIds": []}}'::jsonb NOT NULL,
    primary_requirements jsonb DEFAULT '{"associationRequired":false,"requiredLevels":[]}'::jsonb NOT NULL,
    form_layouts jsonb DEFAULT '{}'::jsonb NOT NULL,
    numbering jsonb DEFAULT '{"enabled":false,"prefix":"","suffix":"","start":"1","increment":"1","padding":1,"restart":"never"}'::jsonb NOT NULL,
    is_sensitive boolean DEFAULT false NOT NULL,
    is_protected boolean DEFAULT false NOT NULL,
    state text DEFAULT 'active'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    permissions_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT sys_object_types_form_layouts_check CHECK ((jsonb_typeof(form_layouts) = 'object'::text) AND (form_layouts - 'default' = '{}'::jsonb)),
    CONSTRAINT sys_object_types_state_check CHECK ((state = ANY (ARRAY['active'::text, 'inactive'::text, 'deleted'::text]))),
    CONSTRAINT sys_object_types_version_check CHECK ((version > 0))
);

CREATE TABLE public.sys_record_identities (
    workspace_id uuid NOT NULL,
    object_type_id uuid NOT NULL,
    record_id uuid NOT NULL,
    deleted_at timestamptz,
    deleted_by text REFERENCES public.sys_users(id),
    deleted_policy jsonb,
    deleted_readers jsonb,
    deleted_keyword text,
    CONSTRAINT sys_record_deleted_check CHECK ((deleted_at IS NULL AND deleted_by IS NULL AND deleted_readers IS NULL AND deleted_policy IS NULL AND deleted_keyword IS NULL) OR (deleted_at IS NOT NULL AND deleted_keyword IS NOT NULL AND deleted_by IS NOT NULL AND deleted_readers IS NOT NULL AND jsonb_typeof(deleted_readers)='object' AND deleted_policy IS NOT NULL AND jsonb_typeof(deleted_policy)='object' AND recycled_at IS NOT NULL)),
    recycled_at timestamp with time zone,
    recycled_by text REFERENCES public.sys_users(id),
    CONSTRAINT sys_record_recycle_pair CHECK ((recycled_at IS NULL) = (recycled_by IS NULL))
);

CREATE INDEX sys_record_deleted_idx ON public.sys_record_identities(workspace_id,deleted_at DESC,record_id) WHERE deleted_at IS NOT NULL;

CREATE INDEX sys_record_recycle_idx ON public.sys_record_identities(workspace_id, recycled_at DESC, record_id) WHERE recycled_at IS NOT NULL;

CREATE TABLE public.sys_record_security (
    workspace_id uuid NOT NULL,
    object_type_id uuid NOT NULL,
    record_id uuid NOT NULL,
    policy jsonb NOT NULL,
    CONSTRAINT sys_record_security_policy_check CHECK ((jsonb_typeof(policy) = 'object'::text))
);

CREATE TABLE public.sys_relationship_journal_endpoints (
    journal_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    object_type_id uuid NOT NULL,
    record_id uuid NOT NULL
);

CREATE TABLE public.sys_relationship_type_pairs (
    relationship_type_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    left_object_type_id uuid NOT NULL,
    right_object_type_id uuid NOT NULL
);

CREATE TABLE public.sys_relationship_types (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    technical_name text NOT NULL,
    kind text NOT NULL,
    labels jsonb NOT NULL,
    directed boolean NOT NULL,
    allow_all boolean NOT NULL,
    left_labels jsonb NOT NULL,
    left_min integer NOT NULL,
    left_max integer,
    left_applicability jsonb,
    right_labels jsonb NOT NULL,
    right_min integer NOT NULL,
    right_max integer,
    right_applicability jsonb,
    active boolean DEFAULT true NOT NULL,
    rules_state text DEFAULT 'draft'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT sys_relationship_custom_scope CHECK (((kind <> 'custom'::text) OR (NOT allow_all))),
    CONSTRAINT sys_relationship_primary_scope CHECK (((kind <> 'primary'::text) OR ((technical_name = 'primary_association'::text) AND directed AND (left_min = 0) AND (left_max IS NULL) AND (right_min = 0) AND (right_max IS NOT NULL) AND (right_max = 1) AND allow_all))),
    CONSTRAINT sys_relationship_types_check1 CHECK (((kind <> 'general'::text) OR ((technical_name = 'general_relation'::text) AND (NOT directed) AND (left_min = 0) AND (left_max IS NULL) AND (right_min = 0) AND (right_max IS NULL) AND allow_all AND active))),
    CONSTRAINT sys_relationship_types_check2 CHECK (((kind <> 'custom'::text) OR (technical_name <> ALL (ARRAY['primary_association'::text, 'general_relation'::text])))),
    CONSTRAINT sys_relationship_types_kind_check CHECK ((kind = ANY (ARRAY['primary'::text, 'general'::text, 'custom'::text]))),
    CONSTRAINT sys_relationship_types_left_max_check CHECK ((left_max = 1)),
    CONSTRAINT sys_relationship_types_left_min_check CHECK ((left_min = ANY (ARRAY[0, 1]))),
    CONSTRAINT sys_relationship_types_right_max_check CHECK ((right_max = 1)),
    CONSTRAINT sys_relationship_types_right_min_check CHECK ((right_min = ANY (ARRAY[0, 1]))),
    CONSTRAINT sys_relationship_types_rules_state_check CHECK ((rules_state = ANY (ARRAY['draft'::text, 'active'::text]))),
    CONSTRAINT sys_relationship_types_version_check CHECK ((version > 0))
);

CREATE TABLE public.sys_relationships (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    relationship_type_id uuid NOT NULL,
    left_object_type_id uuid NOT NULL,
    left_record_id uuid NOT NULL,
    right_object_type_id uuid NOT NULL,
    right_record_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text NOT NULL REFERENCES public.sys_users(id),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    values jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(values)='object'),
    CONSTRAINT sys_relationships_check CHECK (((left_object_type_id <> right_object_type_id) OR (left_record_id <> right_record_id)))
);

CREATE TABLE public.sys_workspace_members (
    workspace_id uuid NOT NULL,
    user_id text NOT NULL,
    role text NOT NULL,
    CONSTRAINT sys_workspace_members_role_check CHECK ((role = ANY (ARRAY['user'::text, 'designer'::text])))
);

CREATE TABLE public.sys_workspace_modules (
    workspace_id uuid NOT NULL,
    module_key text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT sys_workspace_modules_version_check CHECK ((version > 0))
);

CREATE TABLE public.sys_workspaces (
    id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    default_language text DEFAULT 'en'::text NOT NULL,
    available_languages text[] DEFAULT ARRAY['de'::text, 'en'::text] NOT NULL,
    label_languages text[] DEFAULT ARRAY['de'::text, 'en'::text] NOT NULL,
    time_zone text DEFAULT 'UTC'::text NOT NULL,
    regional jsonb DEFAULT '{"locale": "en-US", "hourCycle": "locale", "weekStart": "locale", "dateFormat": "locale", "numberFormat": "locale"}'::jsonb NOT NULL,
    appearance jsonb DEFAULT '{"font": "geist", "theme": "neutral", "radius": "default", "baseColor": "neutral", "menuColor": "default", "chartColor": "neutral", "menuAccent": "subtle", "fontHeading": "inherit", "primaryColor": null, "secondaryColor": null}'::jsonb NOT NULL,
    appearance_version integer DEFAULT 1 NOT NULL,
    language_version integer DEFAULT 1 NOT NULL,
    security_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text NOT NULL,
    CONSTRAINT sys_workspaces_appearance_version_check CHECK ((appearance_version > 0)),
    CONSTRAINT sys_workspaces_check CHECK (((cardinality(available_languages) > 0) AND (available_languages <@ ARRAY['de'::text, 'en'::text]) AND (default_language = ANY (available_languages)))),
    CONSTRAINT sys_workspaces_default_language_check CHECK ((default_language = ANY (ARRAY['de'::text, 'en'::text]))),
    CONSTRAINT sys_workspaces_label_languages_check CHECK (((cardinality(label_languages) > 0) AND (label_languages <@ ARRAY['de'::text, 'en'::text]))),
    CONSTRAINT sys_workspaces_language_version_check CHECK ((language_version > 0))
);

ALTER TABLE ONLY public.sys_content_grants
    ADD CONSTRAINT sys_content_grants_pkey PRIMARY KEY (object_type_id, principal_kind, principal_id);

ALTER TABLE ONLY public.sys_fields
    ADD CONSTRAINT sys_fields_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sys_foreign_access
    ADD CONSTRAINT sys_foreign_access_pkey PRIMARY KEY (workspace_id);

ALTER TABLE ONLY public.sys_group_members
    ADD CONSTRAINT sys_group_members_pkey PRIMARY KEY (group_id, user_id);

ALTER TABLE ONLY public.sys_group_nesting
    ADD CONSTRAINT sys_group_nesting_pkey PRIMARY KEY (group_id, member_group_id);

ALTER TABLE ONLY public.sys_groups
    ADD CONSTRAINT sys_groups_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sys_groups
    ADD CONSTRAINT sys_groups_workspace_id_name_key UNIQUE (workspace_id, name);

ALTER TABLE ONLY public.sys_journal
    ADD CONSTRAINT sys_journal_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sys_module_object_bindings
    ADD CONSTRAINT sys_module_object_bindings_pkey PRIMARY KEY (workspace_id, object_key);

ALTER TABLE ONLY public.sys_module_object_bindings
    ADD CONSTRAINT sys_module_object_bindings_workspace_id_object_type_id_key UNIQUE (workspace_id, object_type_id);

ALTER TABLE ONLY public.sys_modules
    ADD CONSTRAINT sys_modules_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.sys_object_types
    ADD CONSTRAINT sys_object_types_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sys_record_identities
    ADD CONSTRAINT sys_record_identities_pkey PRIMARY KEY (workspace_id, object_type_id, record_id);

ALTER TABLE ONLY public.sys_record_security
    ADD CONSTRAINT sys_record_security_pkey PRIMARY KEY (object_type_id, record_id);

ALTER TABLE ONLY public.sys_relationship_journal_endpoints
    ADD CONSTRAINT sys_relationship_journal_endpoints_pkey PRIMARY KEY (journal_id, object_type_id, record_id);

ALTER TABLE ONLY public.sys_relationship_type_pairs
    ADD CONSTRAINT sys_relationship_type_pairs_pkey PRIMARY KEY (relationship_type_id, left_object_type_id, right_object_type_id);

ALTER TABLE ONLY public.sys_relationship_types
    ADD CONSTRAINT sys_relationship_types_id_workspace_id_key UNIQUE (id, workspace_id);

ALTER TABLE ONLY public.sys_relationship_types
    ADD CONSTRAINT sys_relationship_types_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sys_relationship_types
    ADD CONSTRAINT sys_relationship_types_workspace_id_technical_name_key UNIQUE (workspace_id, technical_name);

ALTER TABLE ONLY public.sys_relationships
    ADD CONSTRAINT sys_relationships_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sys_relationships
    ADD CONSTRAINT sys_relationships_relationship_type_id_left_object_type_id__key UNIQUE (relationship_type_id, left_object_type_id, left_record_id, right_object_type_id, right_record_id);

ALTER TABLE ONLY public.sys_workspace_members
    ADD CONSTRAINT sys_workspace_members_pkey PRIMARY KEY (workspace_id, user_id);

ALTER TABLE ONLY public.sys_workspace_modules
    ADD CONSTRAINT sys_workspace_modules_pkey PRIMARY KEY (workspace_id, module_key);

ALTER TABLE ONLY public.sys_workspaces
    ADD CONSTRAINT sys_workspaces_code_key UNIQUE (code);

ALTER TABLE ONLY public.sys_workspaces
    ADD CONSTRAINT sys_workspaces_pkey PRIMARY KEY (id);

CREATE INDEX sys_content_grants_principal_idx ON public.sys_content_grants USING btree (principal_kind, principal_id, object_type_id);

CREATE UNIQUE INDEX sys_fields_live_name_idx ON public.sys_fields USING btree (object_type_id, technical_name) WHERE (state <> 'deleted'::text);

CREATE INDEX sys_journal_definitions_idx ON public.sys_journal USING btree (object_type_id, created_at, id) WHERE (entity_kind <> ALL (ARRAY['record'::text, 'relationship'::text]));

CREATE INDEX sys_journal_entity_idx ON public.sys_journal USING btree (workspace_id, entity_id, created_at, id);

CREATE INDEX sys_journal_recent_idx ON public.sys_journal USING btree (created_at DESC, id DESC);

CREATE INDEX sys_journal_relationship_type_idx ON public.sys_journal USING btree (workspace_id, COALESCE((new_value ->> 'relationshipTypeId'::text), (old_value ->> 'relationshipTypeId'::text))) WHERE (entity_kind = 'relationship'::text);

CREATE INDEX sys_journal_workspace_recent_idx ON public.sys_journal USING btree (workspace_id, created_at DESC, id DESC);

CREATE UNIQUE INDEX sys_object_types_id_workspace_unique ON public.sys_object_types USING btree (id, workspace_id);

CREATE UNIQUE INDEX sys_object_types_live_name_idx ON public.sys_object_types USING btree (workspace_id, technical_name) WHERE (state <> 'deleted'::text);

CREATE INDEX sys_relationship_history_record_idx ON public.sys_relationship_journal_endpoints USING btree (workspace_id, object_type_id, record_id);

CREATE UNIQUE INDEX sys_relationship_system_kind_unique ON public.sys_relationship_types USING btree (workspace_id, kind) WHERE (kind <> 'custom'::text);

CREATE UNIQUE INDEX sys_relationship_type_single_pair_unique ON public.sys_relationship_type_pairs USING btree (relationship_type_id);

CREATE INDEX sys_relationships_left_idx ON public.sys_relationships USING btree (workspace_id, left_object_type_id, left_record_id);

CREATE INDEX sys_relationships_right_idx ON public.sys_relationships USING btree (workspace_id, right_object_type_id, right_record_id);

CREATE CONSTRAINT TRIGGER xobject_registry_identity AFTER INSERT OR DELETE OR UPDATE ON public.sys_record_identities DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.sys_check_registry_identity();

ALTER TABLE ONLY public.sys_content_grants
    ADD CONSTRAINT sys_content_grants_object_type_id_fkey FOREIGN KEY (object_type_id) REFERENCES public.sys_object_types(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.sys_fields
    ADD CONSTRAINT sys_fields_object_type_id_fkey FOREIGN KEY (object_type_id) REFERENCES public.sys_object_types(id);

ALTER TABLE ONLY public.sys_foreign_access
    ADD CONSTRAINT sys_foreign_access_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.sys_workspaces(id);

ALTER TABLE ONLY public.sys_group_members
    ADD CONSTRAINT sys_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.sys_groups(id);

ALTER TABLE ONLY public.sys_group_members
    ADD CONSTRAINT sys_group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.sys_users(id);

ALTER TABLE ONLY public.sys_group_nesting
    ADD CONSTRAINT sys_group_nesting_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.sys_groups(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.sys_group_nesting
    ADD CONSTRAINT sys_group_nesting_member_group_id_fkey FOREIGN KEY (member_group_id) REFERENCES public.sys_groups(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.sys_groups
    ADD CONSTRAINT sys_groups_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.sys_workspaces(id);

ALTER TABLE ONLY public.sys_journal
    ADD CONSTRAINT sys_journal_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.sys_users(id);

ALTER TABLE ONLY public.sys_journal
    ADD CONSTRAINT sys_journal_field_id_fkey FOREIGN KEY (field_id) REFERENCES public.sys_fields(id);

ALTER TABLE ONLY public.sys_journal
    ADD CONSTRAINT sys_journal_object_type_id_fkey FOREIGN KEY (object_type_id) REFERENCES public.sys_object_types(id);

ALTER TABLE ONLY public.sys_journal
    ADD CONSTRAINT sys_journal_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.sys_workspaces(id);

ALTER TABLE ONLY public.sys_module_object_bindings
    ADD CONSTRAINT sys_module_object_bindings_object_type_id_workspace_id_fkey FOREIGN KEY (object_type_id, workspace_id) REFERENCES public.sys_object_types(id, workspace_id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.sys_module_object_bindings
    ADD CONSTRAINT sys_module_object_bindings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.sys_workspaces(id);

ALTER TABLE ONLY public.sys_object_types
    ADD CONSTRAINT sys_object_types_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.sys_workspaces(id);

ALTER TABLE ONLY public.sys_record_identities
    ADD CONSTRAINT sys_record_identities_object_type_id_workspace_id_fkey FOREIGN KEY (object_type_id, workspace_id) REFERENCES public.sys_object_types(id, workspace_id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.sys_record_security
    ADD CONSTRAINT sys_record_security_workspace_id_object_type_id_record_id_fkey FOREIGN KEY (workspace_id, object_type_id, record_id) REFERENCES public.sys_record_identities(workspace_id, object_type_id, record_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ONLY public.sys_relationship_journal_endpoints
    ADD CONSTRAINT sys_relationship_journal_endp_workspace_id_object_type_id__fkey FOREIGN KEY (workspace_id, object_type_id, record_id) REFERENCES public.sys_record_identities(workspace_id, object_type_id, record_id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.sys_relationship_journal_endpoints
    ADD CONSTRAINT sys_relationship_journal_endpoints_journal_id_fkey FOREIGN KEY (journal_id) REFERENCES public.sys_journal(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.sys_relationship_type_pairs
    ADD CONSTRAINT sys_relationship_type_pairs_left_object_type_id_workspace__fkey FOREIGN KEY (left_object_type_id, workspace_id) REFERENCES public.sys_object_types(id, workspace_id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.sys_relationship_type_pairs
    ADD CONSTRAINT sys_relationship_type_pairs_relationship_type_id_workspace_fkey FOREIGN KEY (relationship_type_id, workspace_id) REFERENCES public.sys_relationship_types(id, workspace_id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.sys_relationship_type_pairs
    ADD CONSTRAINT sys_relationship_type_pairs_right_object_type_id_workspace_fkey FOREIGN KEY (right_object_type_id, workspace_id) REFERENCES public.sys_object_types(id, workspace_id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.sys_relationship_types
    ADD CONSTRAINT sys_relationship_types_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.sys_workspaces(id);

ALTER TABLE ONLY public.sys_relationships
    ADD CONSTRAINT sys_relationships_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.sys_users(id);

ALTER TABLE ONLY public.sys_relationships
    ADD CONSTRAINT sys_relationships_relationship_type_id_workspace_id_fkey FOREIGN KEY (relationship_type_id, workspace_id) REFERENCES public.sys_relationship_types(id, workspace_id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.sys_relationships
    ADD CONSTRAINT sys_relationships_workspace_id_left_object_type_id_left_re_fkey FOREIGN KEY (workspace_id, left_object_type_id, left_record_id) REFERENCES public.sys_record_identities(workspace_id, object_type_id, record_id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.sys_relationships
    ADD CONSTRAINT sys_relationships_workspace_id_right_object_type_id_right__fkey FOREIGN KEY (workspace_id, right_object_type_id, right_record_id) REFERENCES public.sys_record_identities(workspace_id, object_type_id, record_id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.sys_workspace_members
    ADD CONSTRAINT sys_workspace_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.sys_users(id);

ALTER TABLE ONLY public.sys_workspace_members
    ADD CONSTRAINT sys_workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.sys_workspaces(id);

ALTER TABLE ONLY public.sys_workspace_modules
    ADD CONSTRAINT sys_workspace_modules_module_catalog_fkey FOREIGN KEY (module_key) REFERENCES public.sys_modules(key) ON DELETE RESTRICT;

ALTER TABLE ONLY public.sys_workspace_modules
    ADD CONSTRAINT sys_workspace_modules_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.sys_workspaces(id);

ALTER TABLE ONLY public.sys_workspaces
    ADD CONSTRAINT sys_workspaces_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.sys_users(id);

CREATE TABLE public.sys_schema_version (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), version integer NOT NULL CHECK(version=1), definition_hash text NOT NULL);

CREATE CONSTRAINT TRIGGER xobject_security_identity AFTER INSERT OR UPDATE OR DELETE ON public.sys_record_security DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.sys_check_registry_identity();

-- Counters and issued numbers are distinct from mutable business contents. Never reuse issued numbers.
CREATE TABLE public.sys_number_counters (
    object_type_id uuid NOT NULL REFERENCES public.sys_object_types(id),
    period text NOT NULL,
    next_value numeric(31,0) NOT NULL CHECK (next_value > 0),
    PRIMARY KEY (object_type_id, period)
);
CREATE TABLE public.sys_number_allocations (
    object_type_id uuid NOT NULL REFERENCES public.sys_object_types(id),
    record_id uuid NOT NULL,
    number text NOT NULL,
    PRIMARY KEY (object_type_id, record_id),
    UNIQUE (object_type_id, number)
);

CREATE TABLE public.sys_module_field_bindings (
 workspace_id uuid NOT NULL,
 object_key text NOT NULL,
 field_key text NOT NULL,
 field_id uuid NOT NULL REFERENCES public.sys_fields(id) ON DELETE RESTRICT,
 option_keys jsonb NOT NULL DEFAULT '{}'::jsonb,
 PRIMARY KEY(workspace_id,object_key,field_key),
 UNIQUE(field_id),
 FOREIGN KEY(workspace_id,object_key) REFERENCES public.sys_module_object_bindings(workspace_id,object_key) ON DELETE RESTRICT
);
CREATE TABLE public.sys_module_relationship_bindings (
 workspace_id uuid NOT NULL REFERENCES public.sys_workspaces(id) ON DELETE RESTRICT,
 module_key text NOT NULL REFERENCES public.sys_modules(key) ON DELETE RESTRICT,
 relationship_key text NOT NULL,
 relationship_type_id uuid NOT NULL,
 FOREIGN KEY(relationship_type_id,workspace_id) REFERENCES public.sys_relationship_types(id,workspace_id) ON DELETE RESTRICT,
 PRIMARY KEY(workspace_id,relationship_key),UNIQUE(relationship_type_id)
);

-- A field-purpose binding can only reference a field on its own supplied object.
CREATE FUNCTION public.sys_check_module_field_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM sys_module_object_bindings b JOIN sys_fields f ON f.object_type_id=b.object_type_id
   WHERE b.workspace_id=NEW.workspace_id AND b.object_key=NEW.object_key AND f.id=NEW.field_id
 ) OR jsonb_typeof(NEW.option_keys)<>'object' THEN
   RAISE EXCEPTION 'Invalid module field binding scope' USING ERRCODE='23503';
 END IF;
 IF EXISTS (
   SELECT 1 FROM jsonb_each_text(NEW.option_keys) semantic
   WHERE NOT EXISTS (SELECT 1 FROM sys_fields f CROSS JOIN LATERAL jsonb_array_elements(COALESCE(f.config->'options','[]')) option
     WHERE f.id=NEW.field_id AND option->>'id'=semantic.value)
 ) THEN RAISE EXCEPTION 'Invalid module option binding' USING ERRCODE='23503'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER sys_module_field_binding_scope AFTER INSERT OR UPDATE ON public.sys_module_field_bindings
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.sys_check_module_field_binding();

-- One definition owner, one typed value per actual edge and field.
ALTER TABLE public.sys_fields ADD FOREIGN KEY (relationship_type_id) REFERENCES public.sys_relationship_types(id) ON DELETE RESTRICT;
ALTER TABLE public.sys_fields ADD UNIQUE (id,relationship_type_id);
ALTER TABLE public.sys_fields ADD UNIQUE (id,object_type_id);
CREATE UNIQUE INDEX sys_relationship_fields_live_name_idx ON public.sys_fields(relationship_type_id,technical_name) WHERE state<>'deleted';
ALTER TABLE public.sys_relationships ADD UNIQUE (id,relationship_type_id);
CREATE TABLE public.sys_module_contributions (
 workspace_id uuid NOT NULL REFERENCES public.sys_workspaces(id),
 module_key text NOT NULL REFERENCES public.sys_modules(key),
 object_type_id uuid NOT NULL,
 template_version integer NOT NULL CHECK(template_version>0),
 PRIMARY KEY(workspace_id,module_key,object_type_id),
 FOREIGN KEY(object_type_id,workspace_id) REFERENCES public.sys_object_types(id,workspace_id) ON DELETE RESTRICT
);

CREATE TABLE public.sys_module_field_contributions (
 workspace_id uuid NOT NULL,
 module_key text NOT NULL,
 object_type_id uuid NOT NULL,
 field_id uuid NOT NULL,
 FOREIGN KEY(field_id,object_type_id) REFERENCES public.sys_fields(id,object_type_id) ON DELETE RESTRICT,
 PRIMARY KEY(workspace_id,module_key,field_id),
 FOREIGN KEY(workspace_id,module_key,object_type_id) REFERENCES public.sys_module_contributions(workspace_id,module_key,object_type_id) ON DELETE RESTRICT
);

CREATE FUNCTION public.sys_check_relationship_values() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.updated_by := COALESCE(NEW.updated_by,NEW.created_by);
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(NEW.values) k WHERE NOT EXISTS(SELECT 1 FROM sys_fields f WHERE f.id::text=k AND f.relationship_type_id=NEW.relationship_type_id)) THEN
  RAISE EXCEPTION 'Attribute field must belong to its relationship definition' USING ERRCODE='23503';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sys_relationship_values_scope BEFORE INSERT OR UPDATE OF values,relationship_type_id ON public.sys_relationships FOR EACH ROW EXECUTE FUNCTION public.sys_check_relationship_values();

CREATE TABLE public.sys_navigation_preferences (
    workspace_id uuid NOT NULL REFERENCES public.sys_workspaces(id),
    user_id text REFERENCES public.sys_users(id),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    layout jsonb CHECK (layout IS NULL OR jsonb_typeof(layout)='object'),
    UNIQUE NULLS NOT DISTINCT (workspace_id,user_id)
);
