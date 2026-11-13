import type {FormLayout} from '@xobject/contracts';

/** Designer placement state is not a record heading. Preserve every entry under its purpose. */
export function recordDisplayLayout(layout:FormLayout):FormLayout{
 const fields=layout.unassigned?.filter(entry=>'fieldId'in entry)??[];
 const relationships=layout.unassigned?.filter(entry=>!('fieldId'in entry))??[];
 return {...layout,unassigned:[],groups:[...layout.groups,
  ...(fields.length?[{id:':unassigned-fields',labels:{en:'Additional fields',de:'Weitere Felder'},width:'full' as const,fields}]:[]),
  ...(relationships.length?[{id:':unassigned-relationships',labels:{en:'Relationships',de:'Verknüpfungen'},width:'full' as const,fields:relationships}]:[]),
 ]};
}
