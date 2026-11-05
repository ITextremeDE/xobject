import type {Operation,Inputs,Outputs} from './index.js';
import {API_MAJOR} from './api-version.js';
export class XObjectApiError extends Error {
 constructor(readonly status:number,readonly code:string,message:string,readonly details?:{code:string;fieldId?:string;context?:string},readonly issues?:unknown[]){super(message);this.name='XObjectApiError';}
}
/** Bearer-only client: no persisted credentials, redirects or automatic mutation retries. */
export function createApiClient({baseUrl,token,fetch:fetcher=globalThis.fetch}:{baseUrl:string;token:string;fetch?:typeof globalThis.fetch}){
 const base=new URL(baseUrl);
 if(base.username||base.password||base.search||base.hash||base.pathname!=='/')throw new Error('Use the xObject origin as baseUrl');
 if(base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(base.hostname)))throw new Error('API access requires HTTPS except on loopback');
 if(!/^xo1_[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(token))throw new Error('Invalid xObject access token format');
 return {async call<K extends Operation>(operation:K,input:Inputs[K],signal?:AbortSignal):Promise<Outputs[K]>{
  if(!/^[a-z][a-z0-9_]*$/.test(operation))throw new Error('Invalid operation name');
  const response=await fetcher(new URL(`/api/v1/${operation}`,base),{method:'POST',credentials:'omit',redirect:'error',signal,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-XObject-API-Version':API_MAJOR},body:JSON.stringify(input)});
  let body:unknown;try{body=await response.json();}catch{throw new XObjectApiError(response.status,'invalid_response','The server returned an invalid JSON response');}
  if(!response.ok){if(!body||typeof body!=='object')throw new XObjectApiError(response.status,'invalid_response','The server returned an invalid error response');const error=body as {code?:string;error?:string;details?:{code:string;fieldId?:string;context?:string};issues?:unknown[]};throw new XObjectApiError(response.status,error.code??'request_failed',error.error??'Request failed',error.details,error.issues);}
  if(response.headers.get('X-XObject-API-Version')?.split('.')[0]!==API_MAJOR)throw new XObjectApiError(response.status,'incompatible_version','Unexpected API major version');
  return body as Outputs[K];
 }};
}
