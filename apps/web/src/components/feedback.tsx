import { useTranslation } from 'react-i18next';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';

export function ErrorNotice({ error, retry }: { error: unknown; retry?: () => void }) {
  const { t } = useTranslation();
  const moduleLoadFailure = error instanceof Error && /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(error.message);
  const specific: Record<string, string> = { 'Definition language is unavailable': 'definitionLanguageUnavailable', 'Group member must belong to workspace': 'groupMemberScope', 'Group is inactive': 'groupInactiveHelp' };
  const key = moduleLoadFailure ? 'viewLoadFailed' : error instanceof ApiError
    ? specific[error.message] ?? (error.status === 403 ? 'denied' : error.status === 401 ? 'sessionExpired'
      : error.status === 409 ? error.message.includes('conflict') ? 'conflict' : 'duplicate'
      : error.status === 400 ? 'invalid' : error.status === 404 ? 'notFound' : 'networkError')
    : 'networkError';
  return <Alert variant="destructive"><AlertTitle>{t('errorTitle')}</AlertTitle><AlertDescription>
    <p>{t(key)}</p>{retry ? <Button variant="outline" size="sm" onClick={retry}>{t(moduleLoadFailure ? 'reload' : 'retry')}</Button> : null}
  </AlertDescription></Alert>;
}

export function Loading() {
  const { t } = useTranslation();
  return <div role="status" aria-label={t('loading')} className="flex flex-col gap-3 p-6">
    <Skeleton className="h-6 w-36" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" />
  </div>;
}
