import {useState,useEffect} from 'react';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {useTranslation} from 'react-i18next';
import {api} from '@/lib/api';
import {notifySuccess} from '@/lib/notifications';
import {SettingsSection} from './settings-section';
import {SettingsTable} from './settings-table';
import {ClientTablePagination,useClientPagination} from './client-table-pagination';
import {FieldSet,FieldLegend,FieldDescription} from '@/components/ui/field';
import {TableHeader,TableBody,TableRow,TableHead,TableCell} from '@/components/ui/table';
import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {ErrorNotice,Loading} from './feedback';

export function OAuthApplications({active,disabled,onBusyChange}:{active:boolean;disabled:boolean;onBusyChange:(busy:boolean)=>void}){
  const {t}=useTranslation(),client=useQueryClient();
  const apps=useQuery({queryKey:['oauth-authorizations'],queryFn:()=>api('list_oauth_authorizations',{}),enabled:active});
  const pagination=useClientPagination(apps.data??[]);
  const [selected,setSelected]=useState<{clientId:string;name:string}|null>(null);
  const revoke=useMutation({mutationFn:(clientId:string)=>api('revoke_oauth_authorization',{clientId}),onSuccess:async()=>{setSelected(null);notifySuccess(t('oauthRevoked'));await client.invalidateQueries({queryKey:['oauth-authorizations']});}});
  useEffect(()=>onBusyChange(revoke.isPending),[revoke.isPending,onBusyChange]);
  return <SettingsSection><FieldSet className="min-w-0"><FieldLegend>{t('oauthApplications')}</FieldLegend><FieldDescription>{t('oauthApplicationsHelp')}</FieldDescription>
    {apps.isPending?<Loading/>:apps.isError?<ErrorNotice error={apps.error} retry={()=>{void apps.refetch();}}/>:<>
      <SettingsTable aria-label={t('oauthApplications')}><TableHeader><TableRow><TableHead>{t('oauthApplication')}</TableHead><TableHead>{t('oauthRequestedAccess')}</TableHead><TableHead><span className="sr-only">{t('action')}</span></TableHead></TableRow></TableHeader><TableBody>{pagination.rows.length?pagination.rows.map(item=><TableRow key={item.clientId}><TableCell className="whitespace-normal wrap-anywhere">{item.name}</TableCell><TableCell className="whitespace-normal">{t(item.scopes.includes('xobject:write')?'oauthWrite':'oauthRead')}</TableCell><TableCell><Button variant="outline" disabled={disabled||revoke.isPending} aria-label={t('revokeNamedToken',{name:item.name})} onClick={()=>{revoke.reset();setSelected(item);}}>{t('revokeToken')}</Button></TableCell></TableRow>):<TableRow><TableCell colSpan={3}>{t('oauthNoApplications')}</TableCell></TableRow>}</TableBody></SettingsTable>
      <ClientTablePagination pagination={pagination} countLabel={t('oauthApplicationCount',{count:pagination.total})} disabled={disabled||revoke.isPending}/>
    </>}
    <AlertDialog open={Boolean(selected)} onOpenChange={open=>{if(!open&&!revoke.isPending)setSelected(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('revokeNamedToken',{name:selected?.name})}</AlertDialogTitle><AlertDialogDescription>{t('oauthRevokeHelp')}</AlertDialogDescription></AlertDialogHeader>{revoke.isError?<ErrorNotice error={revoke.error}/>:null}<AlertDialogFooter><AlertDialogCancel disabled={revoke.isPending}>{t('cancel')}</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={revoke.isPending} onClick={()=>{if(selected)revoke.mutate(selected.clientId);}}>{revoke.isPending?<Spinner data-icon="inline-start"/>:null}{t('revokeToken')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </FieldSet></SettingsSection>;
}
