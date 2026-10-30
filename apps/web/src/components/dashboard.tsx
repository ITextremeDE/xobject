import { useTranslation } from 'react-i18next';
import { DatabaseIcon, PlusIcon } from 'lucide-react';
import type { Workspace, ObjectSummary } from '@xobject/contracts';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function Dashboard({ canManage, workspace, types, onOpen, onCreate }: {
  canManage: boolean; workspace: Workspace; types: ObjectSummary[]; onOpen: (id: string) => void; onCreate: () => void;
}) {
  const { t } = useTranslation();
  return <>
    <div className="flex flex-col gap-2 py-2"><h1 className="text-2xl font-semibold tracking-tight">{t('dashboard')}</h1><p className="text-muted-foreground">{t('dashboardDescription')}</p></div>
    <Card>
      <CardHeader><CardTitle>{workspace.name}</CardTitle><CardDescription>{t('dashboardObjects')}: {types.length}</CardDescription></CardHeader>
      <CardContent>
        {types.length ? <div className="flex flex-wrap gap-2">{types.map(type => <Button key={type.id} variant="outline" onClick={() => onOpen(type.id)}><DatabaseIcon data-icon="inline-start" />{type.label}</Button>)}</div> : <p className="text-muted-foreground">{t('dashboardEmpty')}</p>}
      </CardContent>
      {canManage ? <CardFooter><Button variant="outline" onClick={onCreate}><PlusIcon data-icon="inline-start" />{t('newObject')}</Button></CardFooter> : null}
    </Card>
  </>;
}
