import {domainErrorMessages} from '@xobject/contracts';
import { useTranslation } from 'react-i18next';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
export {Loading} from './loading';
import { ApiError } from '@/lib/api';

export function ErrorNotice({ error, retry,fieldLabel }: { error: unknown; retry?: () => void;fieldLabel?:string }) {
  const { t } = useTranslation();
  const moduleLoadFailure = error instanceof Error && /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(error.message);
  const key = moduleLoadFailure ? 'viewLoadFailed' : error instanceof ApiError
    ? domainErrorMessages[error.code] ?? ({429:'rateLimited',403:'permissionDenied',401:'sessionExpired',409:'conflict',400:'invalid',404:'notFound'}[error.status] ?? 'networkError')
    : 'networkError';
  const unique=error instanceof ApiError&&error.details?.code==='unique_value';
  const validation=error instanceof ApiError&&(error.status===400||unique||error.details?.code==='primary_required');
  return <Alert variant="destructive"><AlertTitle>{t(validation?'validationTitle':'errorTitle')}</AlertTitle><AlertDescription>
    <p>{unique?t(error.details?.context==='definition'?'uniqueDefinitionConflict':'uniqueRecordConflict',{field:fieldLabel??t('field')}):t(key)}</p>{retry ? <Button variant="outline" size="sm" onClick={retry}>{t(moduleLoadFailure ? 'reload' : 'retry')}</Button> : null}
  </AlertDescription></Alert>;
}
