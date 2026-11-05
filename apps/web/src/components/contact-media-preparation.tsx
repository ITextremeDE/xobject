import {useTranslation} from 'react-i18next';
import {ImageIcon,Building2Icon,UploadIcon} from 'lucide-react';
import type {ContactKind} from '@xobject/contracts';
import {SettingsSection} from './settings-section';
import {FieldSet,FieldLegend,FieldGroup,Field,FieldLabel,FieldDescription} from './ui/field';
import {Avatar,AvatarFallback} from './ui/avatar';
import {Button} from './ui/button';

/** Presentation only: no URL input, media value, upload endpoint or remote request. */
export function ContactMediaPreparation({kind}:{kind:ContactKind|undefined}){
 const {t}=useTranslation();if(!kind)return null;
 const types=kind==='individual'?['photo','logo'] as const:kind==='organization'?['logo'] as const:['photo'] as const;
 return <SettingsSection><FieldSet><FieldLegend>{t(types.length===1?types[0]==='photo'?'contactPhoto':'contactLogo':'contactMedia')}</FieldLegend><FieldGroup className="grid gap-6 md:grid-cols-2">{types.map(type=><Field key={type}><FieldLabel className={types.length===1?'sr-only':undefined}>{t(type==='photo'?'contactPhoto':'contactLogo')}</FieldLabel><div className="flex items-center gap-3"><Avatar className="size-12"><AvatarFallback>{type==='photo'?<ImageIcon/>:<Building2Icon/>}</AvatarFallback></Avatar><Button type="button" variant="outline" size="sm" disabled><UploadIcon data-icon="inline-start"/>{t('contactMediaUpload')}</Button></div></Field>)}</FieldGroup><FieldDescription>{t('contactMediaPending')}</FieldDescription></FieldSet></SettingsSection>;
}
