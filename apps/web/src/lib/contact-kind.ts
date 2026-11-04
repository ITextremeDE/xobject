import type {ContactKind,ObjectDefinition} from '@xobject/contracts';
/** Labels remain normal translated metadata even though kind identities are fixed. */
export function contactKindLabel(definition:ObjectDefinition,kind:ContactKind,language:string,fallback:string):string{
 const profile=definition.contactProfile;
 const labels=definition.fields.find(f=>f.id===profile?.fields.contact_kind)?.config.options?.find(o=>o.id===profile?.kinds[kind])?.labels;
 return labels?.[language as 'en'|'de']??labels?.en??labels?.de??fallback;
}
