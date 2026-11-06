import {useTranslation} from 'react-i18next';
import {choiceAncestors,choiceDescendants} from '@xobject/contracts';
import type {PickerChoice} from './choice-picker';
import {Field,FieldLabel} from './ui/field';
import {ClassificationSelect} from './classification-values';
export function ChoiceTreeParent({id,options,disabled,onChange}:{id:string;options:PickerChoice[];disabled:boolean;onChange:(parentId:string|null)=>void}){
 const {t}=useTranslation(),option=options.find(option=>option.id===id),excluded=new Set([id,...choiceDescendants(options,id)]);
 const name=(id:string)=>options.find(option=>option.id===id)?.label??id;
 return <Field><FieldLabel htmlFor={`choice-parent-${id}`}>{t('choiceParent')}</FieldLabel><ClassificationSelect id={`choice-parent-${id}`} value={option?.parentId??''} disabled={disabled} options={[{value:'',label:t('choiceRoot')},...options.filter(parent=>!excluded.has(parent.id)&&(!option?.active||parent.active)&&choiceAncestors(options,parent.id).length<20).map(parent=>({value:parent.id,label:[...choiceAncestors(options,parent.id).reverse().map(name),parent.label].join(' / ')}))]} onValueChange={value=>onChange(value||null)}/></Field>;
}
