import {useTranslation} from 'react-i18next';
import {formLayoutSchema,type JournalEntry} from '@xobject/contracts';
import {Badge} from '@/components/ui/badge';
import {FieldSet,FieldLegend,FieldDescription} from '@/components/ui/field';
import {formSnapshotGroups} from '@/lib/form-layout-presentation';

export function JournalFormLayoutValue({value,context}:{value:unknown;context:JournalEntry['form_layout_context']}){
  const {t,i18n}=useTranslation();
  const parsed=formLayoutSchema.safeParse(value);if(!parsed.success)return null;
  const groups=formSnapshotGroups(parsed.data,context,i18n.language,t);
  return <div className="flex flex-col gap-4">
    {groups.map(group=><FieldSet key={group.id} className="gap-2"><FieldLegend variant="label" className="mb-0">{group.label}</FieldLegend>{!group.entries.length?<FieldDescription>{t('formGroupEmpty')}</FieldDescription>:<ol className="flex flex-col gap-3">{group.entries.map(entry=><li key={entry.key} className="flex flex-col gap-1"><span>{entry.label}</span><span className="flex flex-wrap gap-1">{entry.settings.map(setting=><Badge key={setting} variant="outline">{setting}</Badge>)}</span></li>)}</ol>}</FieldSet>)}
    {!groups.length?<FieldDescription>{t('formSnapshotNoGroups')}</FieldDescription>:null}
  </div>;
}
