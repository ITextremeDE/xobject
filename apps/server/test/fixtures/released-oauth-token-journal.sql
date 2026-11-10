-- Released 1.0.0/1.0.1 trigger fixture for the supported installation upgrade.
-- Provider-issued opaque token state is journaled in the same statement transaction.
-- Never persist tokens, hashes, authorization codes, proofs or refresh secrets in history.
CREATE FUNCTION public.journal_oauth_token_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
    IF TG_OP = 'INSERT' OR (OLD.revoked IS NULL AND NEW.revoked IS NOT NULL) THEN
        INSERT INTO public.sys_journal(id,change_id,entity_kind,entity_id,field_key,old_value,new_value,actor_id,access_channel)
        VALUES(uuidv7(),uuidv7(),'oauth_credential',NEW.id::uuid,
          CASE WHEN TG_OP='INSERT' THEN 'created' ELSE 'revoked' END,
          CASE WHEN TG_OP='INSERT' THEN NULL ELSE 'false'::jsonb END,
          CASE WHEN TG_OP='INSERT' THEN jsonb_build_object('name',(SELECT COALESCE(c.name,c.client_id) FROM sys_oauth_client c WHERE c.client_id=NEW.client_id),'userId',NEW.user_id,'clientId',NEW.client_id,'scopes',NEW.scopes,'expiresAt',NEW.expires_at,'kind',TG_TABLE_NAME) ELSE 'true'::jsonb END,
          COALESCE(NULLIF(current_setting('xobject.actor_id',true),''),NEW.user_id),
          COALESCE(NULLIF(current_setting('xobject.channel',true),''),'oauth'));
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER sys_oauth_access_token_journal AFTER INSERT OR UPDATE OF revoked ON public.sys_oauth_access_token FOR EACH ROW EXECUTE FUNCTION public.journal_oauth_token_state();
CREATE TRIGGER sys_oauth_refresh_token_journal AFTER INSERT OR UPDATE OF revoked ON public.sys_oauth_refresh_token FOR EACH ROW EXECUTE FUNCTION public.journal_oauth_token_state();
