export type MergePlan={merged:Record<string,unknown>;conflicts:string[]};
export function sameDraftValue(a:unknown,b:unknown):boolean{
 if(a===b)return true;if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return false;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>sameDraftValue(value,b[index]));
 const left=a as Record<string,unknown>,right=b as Record<string,unknown>,keys=Object.keys(left);return keys.length===Object.keys(right).length&&keys.every(key=>Object.hasOwn(right,key)&&sameDraftValue(left[key],right[key]));
}
/** Three-way merge; a local edit never silently wins over a concurrent edit. */
export function mergeDraft(base:Record<string,unknown>,local:Record<string,unknown>,remote:Record<string,unknown>):MergePlan{
 const merged:Record<string,unknown>={},conflicts:string[]=[];
 for(const key of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
  // Removed/unreadable fields are purged, including unsaved private values.
  if(!Object.hasOwn(remote,key))continue;
  if(sameDraftValue(local[key],base[key]))merged[key]=remote[key];
  else if(sameDraftValue(remote[key],base[key])||sameDraftValue(local[key],remote[key]))merged[key]=local[key];
  else{conflicts.push(key);merged[key]=local[key];}
 }
 return {merged,conflicts};
}
