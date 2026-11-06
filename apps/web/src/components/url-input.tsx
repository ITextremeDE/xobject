import type {ComponentProps} from 'react';
import {useTranslation} from 'react-i18next';
import {ArrowUpRightIcon} from 'lucide-react';
import {webURL} from '@/lib/web-url';
import {InputGroup,InputGroupInput,InputGroupAddon,InputGroupButton} from './ui/input-group';
/** Navigation stays available for readable URLs even when the value cannot be edited. */
export function URLInput({linkLabel,...props}:ComponentProps<typeof InputGroupInput>&{linkLabel?:string}){
 const {t}=useTranslation(),href=webURL(props.value),label=t('openURLInNewTab',{name:linkLabel??props['aria-label']??t('fieldKind_url')});
 return <InputGroup><InputGroupInput {...props} type="url"/><InputGroupAddon align="inline-end"><InputGroupButton size="icon-xs" aria-label={label} title={label} disabled={!href} nativeButton={!href} render={href?<a href={href} target="_blank" rel="noopener noreferrer"/>:undefined}><ArrowUpRightIcon/></InputGroupButton></InputGroupAddon></InputGroup>;
}
