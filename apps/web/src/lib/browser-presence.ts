export function recordURL(origin:string,workspaceCode:string,technicalName:string,recordId:string){
 return new URL(`/w/${encodeURIComponent(workspaceCode)}/objects/${encodeURIComponent(technicalName)}/${encodeURIComponent(recordId)}`,origin).href;
}
export function pageTitle(name:string,mode:'context'|'neutral',parts:(string|undefined)[]){return mode==='neutral'?name:[...parts.filter(Boolean),name].join(' · ');}
