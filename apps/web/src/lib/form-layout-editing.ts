import type {FormLayout} from '@xobject/contracts';

/** Adding a group must retain every staged element and its display settings. */
export function appendFormGroup(layout:FormLayout,group:FormLayout['groups'][number]):FormLayout {
  return {...layout,groups:[...layout.groups,group]};
}
