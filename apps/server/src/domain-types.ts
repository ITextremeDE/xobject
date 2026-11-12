import type {Executor} from './database.js';
import type {ClassificationConfig,FieldConfig,FieldInputRules,FormLayouts,Language,Numbering} from '@xobject/contracts';
export type Labels = Record<string, string>;
export type ObjectType = { primary_requirements:import('@xobject/contracts').PrimaryRequirements; numbering:Numbering; time_zone:string; permissions_version:number; form_layouts?:FormLayouts; version: number; id: string; workspace_id: string; technical_name: string; code: string; labels: Labels; default_language: string; available_languages: Language[]; classification: ClassificationConfig; state: 'active' | 'inactive' | 'deleted'; is_protected: boolean };
export type Field = { value_mode:'stored'|'derived';input_rules:FieldInputRules; applicability?: import('@xobject/contracts').FieldApplicability; version: number; id: string; technical_name: string; labels: Labels; kind: string; required: boolean; config: FieldConfig; state: 'active' | 'inactive' | 'deleted'; is_protected: boolean };
export type DataRecord = Record<string, unknown> & { id: string; version: number; keyword: string };

export type JournalWriter=(tx:Executor,actor:string,workspace:string|null,type:string|null,entityKind:string,entityId:string,changeId:string,key:string,before:unknown,after:unknown,fieldId?:string|null)=>Promise<void>;
