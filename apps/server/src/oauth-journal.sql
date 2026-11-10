-- Durable authorization decisions, not the provider's rotating token inventory.
-- This fragment is shared by fresh installation and the supported released upgrade.
CREATE FUNCTION public.journal_oauth_authorization_state() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
 before_value jsonb;
 after_value jsonb;
BEGIN
 IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
 after_value := jsonb_build_object('name',(SELECT COALESCE(c.name,c.client_id) FROM public.sys_oauth_client c WHERE c.client_id=NEW.client_id),
   'userId',NEW.user_id,'clientId',NEW.client_id,'scopes',NEW.scopes,'resources',NEW.resources,'claims',NEW.requested_user_info_claims,'kind','sys_oauth_consent');
 IF TG_OP='UPDATE' THEN
   IF OLD.scopes IS NOT DISTINCT FROM NEW.scopes AND OLD.resources IS NOT DISTINCT FROM NEW.resources
     AND OLD.requested_user_info_claims IS NOT DISTINCT FROM NEW.requested_user_info_claims THEN RETURN NEW; END IF;
   before_value := jsonb_build_object('name',after_value->'name','userId',OLD.user_id,'clientId',OLD.client_id,
     'scopes',OLD.scopes,'resources',OLD.resources,'claims',OLD.requested_user_info_claims,'kind','sys_oauth_consent');
 END IF;
 INSERT INTO public.sys_journal(id,change_id,entity_kind,entity_id,field_key,old_value,new_value,actor_id,access_channel)
 VALUES(uuidv7(),uuidv7(),'oauth_credential',NEW.id::uuid,'authorization',before_value,after_value,
   COALESCE(NULLIF(current_setting('xobject.actor_id',true),''),NEW.user_id),'oauth');
 RETURN NEW;
END;
$$;
CREATE TRIGGER sys_oauth_consent_journal AFTER INSERT OR UPDATE ON public.sys_oauth_consent
 FOR EACH ROW EXECUTE FUNCTION public.journal_oauth_authorization_state();
