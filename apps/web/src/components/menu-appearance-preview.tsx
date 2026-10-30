import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Field, FieldLabel } from '@/components/ui/field';

/** Local interaction only: no mutations or shared settings are changed by these examples. */
export function MenuAppearancePreview() {
  const { t } = useTranslation();
  const id = useId();
  const [choice, setChoice] = useState('first');
  const [selection, setSelection] = useState('first');
  const options = [{ value: 'first', label: t('menuPreviewFirst') }, { value: 'second', label: t('menuPreviewSecond') }];
  const items = [...options, { value: 'disabled', label: t('menuPreviewDisabled') }];
  return <div className="flex flex-col gap-3">
    <DropdownMenu><DropdownMenuTrigger render={<Button type="button" variant="outline" />} aria-label={t('menuPreviewOpen')}>
      {t('menuPreviewOpen')}<ChevronDownIcon data-icon="inline-end" />
    </DropdownMenuTrigger><DropdownMenuContent className="w-52" align="start"><DropdownMenuGroup><DropdownMenuLabel>{t('menuPreviewLabel')}</DropdownMenuLabel><DropdownMenuRadioGroup value={choice} onValueChange={setChoice}>{options.map(item => <DropdownMenuRadioItem key={item.value} value={item.value}>{item.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuGroup><DropdownMenuSeparator /><DropdownMenuGroup><DropdownMenuItem disabled>{t('menuPreviewDisabled')}</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu>
    <Field><FieldLabel htmlFor={id}>{t('menuPreviewSelect')}</FieldLabel><Select items={items} value={selection} onValueChange={value => { if (value) setSelection(value); }}><SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger><SelectContent alignItemWithTrigger={false}><SelectGroup>{items.map(item => <SelectItem key={item.value} value={item.value} disabled={item.value === 'disabled'}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
  </div>;
}
