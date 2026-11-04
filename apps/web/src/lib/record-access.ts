import {accessRank,principalKey,type RecordSecurity,type Principal} from '@xobject/contracts';
export function toggleRecordOwner(policy:RecordSecurity,principal:Principal):RecordSecurity {
 const key=principalKey(principal),present=policy.owners.some(owner=>principalKey(owner)===key);
 return {...policy,owners:present?policy.owners.filter(owner=>principalKey(owner)!==key):[...policy.owners,{...principal,level:'full'}]};
}
export function sameRecordSecurity(a:RecordSecurity,b:RecordSecurity){
 const canonical=(p:RecordSecurity)=>JSON.stringify({...p,owners:[...p.owners].sort((a,b)=>principalKey(a).localeCompare(principalKey(b))),fields:p.fields.map(rule=>({...rule,fields:Object.fromEntries(Object.entries(rule.fields).sort(([a],[b])=>a.localeCompare(b)))})).sort((a,b)=>principalKey(a).localeCompare(principalKey(b)))});
 return canonical(a)===canonical(b);
}
export const widensPublicAccess=(before:RecordSecurity,next:RecordSecurity)=>next.publicLevel!==null&&(before.publicLevel===null||accessRank(next.publicLevel)>accessRank(before.publicLevel));
export const validRecordSecurityDraft=(before:RecordSecurity,next:RecordSecurity,confirmed:boolean)=>Boolean((next.owners.length||next.publicLevel!==null)&&(next.publicLevel===null||next.privacy==='normal')&&(!widensPublicAccess(before,next)||confirmed));
