import type { ClassificationRules, ClassificationConfig } from '@xobject/contracts';
import { AppError } from './errors.js';

export type Choices = { type: string | null; status: string | null; category: string[] };
export function validateRules(config: ClassificationRules, previous: ClassificationConfig, removable = new Set<string>()) {
  const options = new Map(config.options.map(option => [option.id, option]));
  if (options.size !== config.options.length) throw new AppError(400, 'Duplicate option IDs');
  for (const old of previous.options) {
    if ((options.has(old.id) && options.get(old.id)?.kind !== old.kind) || (!options.has(old.id) && old.kind === 'category' && !removable.has(old.id))) throw new AppError(400, 'Options must be retained with their kind; deactivate instead of deleting');
  }
  for (const option of config.options) {
    if (option.kind !== 'status' && option.typeId !== null) throw new AppError(400, 'Only Status options have a Type');
    if (option.kind === 'status' && option.typeId && options.get(option.typeId)?.kind !== 'type') throw new AppError(400, 'Unknown Status Type');
  }
  const activeChoice = (id: string, kind: string) => options.get(id)?.kind === kind && options.get(id)?.active;
  if (config.type.defaultId && !activeChoice(config.type.defaultId, 'type')) throw new AppError(400, 'Invalid default Type');
  if (config.category.defaultIds.some(id => !activeChoice(id, 'category')) || (!config.category.multiple && config.category.defaultIds.length > 1)) throw new AppError(400, 'Invalid default Category');
  const parents = new Set<string | null>();
  for (const initial of config.status.defaults) {
    if (parents.has(initial.typeId) || !activeChoice(initial.statusId, 'status') || options.get(initial.statusId)?.typeId !== initial.typeId) throw new AppError(400, 'Invalid initial Status');
    if (initial.typeId && !activeChoice(initial.typeId, 'type')) throw new AppError(400, 'Initial Status requires an active Type');
    parents.add(initial.typeId);
  }
  const activeTypes = config.options.filter(option => option.active && option.kind === 'type');
  if (config.type.required && !activeTypes.length) throw new AppError(400, 'Required Type needs active options');
  if (config.category.required && !config.options.some(option => option.active && option.kind === 'category')) throw new AppError(400, 'Required Category needs active options');
  if (config.status.required) {
    const scopes: (string | null)[] = activeTypes.map(option => option.id);
    if (!config.type.required) scopes.push(null);
    if (scopes.some(typeId => !config.options.some(option => option.active && option.kind === 'status' && option.typeId === typeId))) throw new AppError(400, 'Required Status needs options for each available Type, including no Type');
  }
}

export function validateChoices(config: ClassificationRules, value: Choices, previous?: Choices) {
  const options = new Map(config.options.map(option => [option.id, option]));
  if ((config.type.required && !value.type) || (config.status.required && !value.status) || (config.category.required && !value.category.length)) throw new AppError(400, 'Required classification value missing');
  if ((!config.category.multiple && value.category.length > 1) || new Set(value.category).size !== value.category.length) throw new AppError(400, 'Invalid Category cardinality');
  for (const kind of ['type', 'status', 'category'] as const) {
    const values = kind === 'category' ? value.category : value[kind] ? [value[kind]!] : [];
    for (const id of values) {
      const option = options.get(id);
      const retained = kind === 'category' ? previous?.category.includes(id) : previous?.[kind] === id;
      if (!option || option.kind !== kind || (!option.active && !retained)) throw new AppError(400, 'Unknown or inactive classification option');
      if (kind === 'status' && option.typeId !== value.type) throw new AppError(400, 'Status does not belong to the selected Type');
    }
  }
}

export function resolveChoices(config: ClassificationConfig, input: Partial<Choices>, previous?: Choices): Choices {
  const type = input.type !== undefined ? input.type : previous ? previous.type : config.type.defaultId;
  const status = input.status !== undefined ? input.status : previous ? previous.status : config.status.defaults.find(initial => initial.typeId === type)?.statusId ?? null;
  const category = [...(input.category ?? (previous ? previous.category : config.category.defaultIds))].sort();
  const result = { type, status, category };
  validateChoices(config, result, previous);
  return result;
}
