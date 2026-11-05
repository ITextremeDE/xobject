import {toast} from '@/components/ui/toast';

/** Transient results only: never pass record contents, IDs or secrets as messages. */
export function notifySuccess(title:string){toast.add({title,type:'success',timeout:3500});}
export function notifyError(title:string){toast.add({title,type:'error',timeout:7000,priority:'high'});}
export async function copyToClipboard(value:string,success:string,failure:string){
 try{await navigator.clipboard.writeText(value);notifySuccess(success);return true;}
 catch{notifyError(failure);return false;}
}
