import type {RelatedRecord} from '@xobject/contracts';
export function contactPersonValues(record:Pick<RelatedRecord,'contactPerson'>,language:string){
 const details=record.contactPerson;
 return {jobTitle:details?.jobTitle??'',department:details?.department??'',function:details?.functionLabels?.map(labels=>labels[language]??labels.en??labels.de??Object.values(labels)[0]??'').join(', ')??''};
}
