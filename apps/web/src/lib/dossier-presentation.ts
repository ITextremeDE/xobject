import type { DossierEntry } from '@xobject/contracts';
export type DossierRow = { iconKey?:import('@xobject/contracts').RecordIconKey; id:string; recordId:string; objectTypeId:string; objectTechnicalName:string; relationship:string; object:string; keyword:string; type:string; status:string; category:string };
export type DossierSort = { by:string; direction:'asc'|'desc' };
export function dossierRows(entries:DossierEntry[],language:string):DossierRow[] {
  const label=(labels:Record<string,string>)=>labels[language]??labels.de??labels.en??Object.values(labels)[0]??'';
  return entries.map(({id,definition,record})=>{
    const choice=(kind:'type'|'status'|'category',ids:string[])=>{
      const options=record.classificationOptions.filter(option=>option.kind===kind&&ids.includes(option.id));
      return [...options.map(option=>label(option.labels)),...ids.filter(id=>!options.some(option=>option.id===id))].join(', ')||'—';
    };
    return {id,iconKey:record.iconKey,recordId:record.recordId,objectTypeId:record.objectTypeId,objectTechnicalName:record.objectTechnicalName,relationship:label(definition.labels),object:label(record.objectLabels),keyword:record.keyword,type:choice('type',record.type?[record.type]:[]),status:choice('status',record.status?[record.status]:[]),category:choice('category',record.category)};
  });
}
export function sortDossierRows(rows:DossierRow[],sort:DossierSort,language:string) {
  const collator=new Intl.Collator(language,{numeric:true,sensitivity:'base'});
  const by=(['relationship','object','keyword','type','status','category'].includes(sort.by)?sort.by:'keyword') as keyof DossierRow;
  return [...rows].sort((a,b)=>(sort.direction==='asc'?1:-1)*collator.compare(a[by]??'',b[by]??'')||a.id.localeCompare(b.id));
}
