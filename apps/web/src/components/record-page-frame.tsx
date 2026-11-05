import type {ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import {TabsList,TabsTrigger} from './ui/tabs';
import {Skeleton} from './ui/skeleton';

export const recordPageClassName='flex w-full min-w-0 min-h-[calc(100svh-8rem)] flex-col gap-6 pb-6';
export function RecordPageHeader({navigation,title,description,actions}:{navigation:ReactNode;title:ReactNode;description:ReactNode;actions?:ReactNode}){
 return <header className="flex min-w-0 flex-col gap-2">
  <div className="flex flex-wrap items-center justify-between gap-3">{navigation}</div>
  {title}<div className="text-sm text-muted-foreground">{description}</div>
  {actions!==undefined?<div className="hidden min-h-8 flex-wrap items-center gap-2 pt-4 sm:flex">{actions}</div>:null}
 </header>;
}
export function RecordSectionTabs({isNew=false,treeAvailable,loading=false}:{isNew?:boolean;treeAvailable?:boolean;loading?:boolean}){
 const {t}=useTranslation();
 if(loading&&treeAvailable===undefined&&!isNew)return <div className="flex h-8 items-center" aria-hidden="true"><Skeleton className="h-8 w-64 max-w-full"/></div>;
 return <TabsList variant="line" aria-label={t('recordSections')} className="max-w-full"><TabsTrigger value="details" disabled={loading}>{t('details')}</TabsTrigger>{!isNew?<>{treeAvailable?<TabsTrigger value="tree" disabled={loading}>{t('recordTree')}</TabsTrigger>:null}<TabsTrigger value="dossier" disabled={loading}>{t('recordDossier')}</TabsTrigger><TabsTrigger value="journal" disabled={loading}>{t('journal')}</TabsTrigger></>:null}</TabsList>;
}
export function RecordPageFooter({children}:{children:ReactNode}){
 const {t}=useTranslation();
 return <footer className="sticky bottom-0 mt-auto flex flex-wrap items-center justify-between gap-3 border-t bg-background py-3" aria-label={t('recordFormActions')}>{children}</footer>;
}
