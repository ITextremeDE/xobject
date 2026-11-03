import { useTranslation } from 'react-i18next';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
export {Loading} from './loading';
import { ApiError } from '@/lib/api';

export function ErrorNotice({ error, retry }: { error: unknown; retry?: () => void }) {
  const { t } = useTranslation();
  const moduleLoadFailure = error instanceof Error && /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(error.message);
  const specific: Record<string, string> = {'Technical name is reserved for a module object':'moduleNameReserved','Module object name conflicts with an existing custom object':'moduleObjectNameConflict','Object type is used by the Primary chain':'primaryChainObjectUsed','Existing Primary associations violate the configured levels':'primaryChainInvalidExisting','Primary association does not follow configured levels':'primaryChainInvalidPair','Relationship endpoint conditions are not satisfied':'relationshipConditionInvalid','Relationship condition needs an active unconditional choice field and valid options':'relationshipConditionConfigurationInvalid', 'Field is an applicability controller':'fieldApplicabilityDependency', 'Option is referenced by field applicability':'fieldApplicabilityDependency', 'Applicability controller must remain unconditional':'fieldApplicabilityDependency', 'Applicability requires an unconditional active single-choice field':'fieldApplicabilityDependency', 'Unknown applicability option':'fieldApplicabilityDependency', 'Primary association cycle':'primaryCycleHelp', 'A record has at most one Primary association':'primaryParentLimitHelp', 'Remove existing Primary associations before disabling Projects':'projectsModuleInUse', 'Used object pair is fixed':'relationPairLocked', 'Used relationship direction is fixed':'relationPairLocked', 'Enable the Projects module first':'projectsModuleDisabled', 'Custom relationships require exactly one object pair':'relationSinglePairHelp', 'System relationship semantics are protected':'relationSystemProtected', 'Definition language is unavailable': 'definitionLanguageUnavailable', 'Group member must belong to workspace': 'groupMemberScope', 'Group is inactive': 'groupInactiveHelp' };
  const key = moduleLoadFailure ? 'viewLoadFailed' : error instanceof ApiError
    ? specific[error.message] ?? (error.message.startsWith('Relationship cardinality violated')?'relationCardinalityHelp':undefined) ?? (error.status === 403 ? 'denied' : error.status === 401 ? 'sessionExpired'
      : error.status === 409 ? error.message.includes('conflict') ? 'conflict' : 'duplicate'
      : error.status === 400 ? 'invalid' : error.status === 404 ? 'notFound' : 'networkError')
    : 'networkError';
  return <Alert variant="destructive"><AlertTitle>{t('errorTitle')}</AlertTitle><AlertDescription>
    <p>{t(key)}</p>{retry ? <Button variant="outline" size="sm" onClick={retry}>{t(moduleLoadFailure ? 'reload' : 'retry')}</Button> : null}
  </AlertDescription></Alert>;
}
