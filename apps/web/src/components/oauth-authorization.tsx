import {useEffect,useRef} from 'react';
import {useQuery,useMutation} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import {Button} from '@/components/ui/button';
import {Card,CardHeader,CardTitle,CardDescription,CardContent,CardFooter} from '@/components/ui/card';
import {FieldGroup,Field,FieldLabel,FieldDescription} from '@/components/ui/field';
import {ErrorNotice,Loading} from './feedback';
import {Spinner} from '@/components/ui/spinner';

async function authorizationRequest<T>(path:string,body:unknown):Promise<T>{
  const response=await fetch(path,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-XObject-Request':'1'},body:JSON.stringify(body)});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error??result.message??'Authorization failed');
  return result;
}
export function OAuthAuthorization(){
  const {t}=useTranslation();
  const query=window.location.search.slice(1),login=window.location.pathname==='/oauth/login';
  const context=useQuery({queryKey:['oauth-consent',query],queryFn:()=>authorizationRequest<{name:string;clientId:string;scopes:string[];redirectUri:string}>('/api/oauth/consent-context',{query}),enabled:!login,retry:false});
  const mutation=useMutation({mutationFn:async(accept:boolean)=>{
    const result=await authorizationRequest<{url:string}>(`/api/auth/oauth2/${login?'continue':'consent'}`,{oauth_query:query,...(!login?{accept}:{selected:true})});
    window.location.assign(result.url);
  }});
  const started=useRef(false);
  useEffect(()=>{if(login&&!started.current){started.current=true;mutation.mutate(true);}},[login]);
  return <main className="flex min-h-svh items-center justify-center px-4 py-10"><Card className="w-full max-w-lg">
    <CardHeader><CardTitle>{t('oauthAuthorize')}</CardTitle><CardDescription>{t('oauthConsentHelp')}</CardDescription></CardHeader>
    <CardContent>{mutation.isError?<ErrorNotice error={mutation.error}/>:null}{login||context.isPending?<Loading/>:context.isError?<ErrorNotice error={context.error} retry={()=>{void context.refetch();}}/>:<FieldGroup>
      <Field><FieldLabel>{t('oauthApplication')}</FieldLabel><p className="wrap-anywhere">{context.data.name}</p><FieldDescription className="wrap-anywhere">{context.data.clientId}</FieldDescription></Field>
      <Field><FieldLabel>{t('oauthRequestedAccess')}</FieldLabel>{[context.data.scopes.includes('xobject:write')?'xobject:write':'xobject:read',...(context.data.scopes.includes('offline_access')?['offline_access']:[])].map(scope=><FieldDescription key={scope}>{t(scope==='xobject:write'?'oauthWrite':scope==='offline_access'?'oauthOffline':'oauthRead')}</FieldDescription>)}</Field>
      <Field><FieldLabel>{t('oauthReturnTo')}</FieldLabel><FieldDescription className="wrap-anywhere">{context.data.redirectUri}</FieldDescription></Field>
    </FieldGroup>}</CardContent>
    <CardFooter className="justify-end gap-2">{login?<Button variant="outline" onClick={()=>mutation.mutate(true)} disabled={mutation.isPending}>{t('retry')}</Button>:<>
      <Button variant="outline" disabled={!context.isSuccess||mutation.isPending} onClick={()=>mutation.mutate(false)}>{t('oauthDeny')}</Button>
      <Button disabled={!context.isSuccess||mutation.isPending} onClick={()=>mutation.mutate(true)}>{mutation.isPending?<Spinner data-icon="inline-start"/>:null}{t('oauthAllow')}</Button>
    </>}</CardFooter>
  </Card></main>;
}
