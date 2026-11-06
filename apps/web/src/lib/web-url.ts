/** Match the HTTP(S)-only URL field contract; never make other URI schemes actionable. */
export function webURL(value:unknown):string|null{
 if(typeof value!=='string'||!value||value!==value.trim())return null;
 try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:null;}catch{return null;}
}
