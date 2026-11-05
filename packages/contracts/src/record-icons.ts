/** Semantic presentation keys, independent of translated labels and technical names. */
export type RecordIconKey = 'object' | 'contact' | 'organization' | 'person' | 'individual' | 'distribution_list' | 'project' | 'case' | 'task';
export function objectIconKey(objectKey:string|null|undefined):RecordIconKey {
 return ['contact','distribution_list','project','case','task'].includes(objectKey??'')?objectKey as RecordIconKey:'object';
}
