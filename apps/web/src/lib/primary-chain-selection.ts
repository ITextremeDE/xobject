import {primaryChainRoles,type PrimaryChainContext,type PrimaryChainRole,type RelatedRecord} from '@xobject/contracts';

/** The closest visible earlier level is both the picker scope and removal fallback. */
export function primaryPreviousRecord(levels:PrimaryChainContext['levels'],role:PrimaryChainRole):RelatedRecord|null{
 const earlier=primaryChainRoles.slice(0,primaryChainRoles.indexOf(role));
 return [...earlier].reverse().map(previous=>levels.find(level=>level.role===previous)?.record).find((record):record is RelatedRecord=>Boolean(record))??null;
}
