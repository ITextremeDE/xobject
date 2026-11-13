import {useState} from 'react';
import {useSearchParams} from 'react-router';
export const settingsSections=['profile','security','appearance','language','workspaceGeneral','workspaceAppearance','workspaceLanguage','workspaceModules','workspaceObjects','workspaceRelationships','workspaceForms','workspaceMembers','workspaceGroups','systemUsers','systemJournal'] as const;
export type SettingsSectionKey=typeof settingsSections[number];
export function settingsSection(value:string|null,isAdmin:boolean):SettingsSectionKey{
 return settingsSections.includes(value as SettingsSectionKey)&&(!value?.startsWith('system')||isAdmin)?value as SettingsSectionKey:'profile';
}
export function useSettingsRoute(isAdmin:boolean){
 const [params,setParams]=useSearchParams();
 return {section:settingsSection(params.get('section'),isAdmin),selectSection:(value:SettingsSectionKey)=>setParams(previous=>{const next=new URLSearchParams(previous);next.set('section',value);return next;},{replace:true})};
}

/** Select immediately; URL navigation may commit later while the previous editor is still mounted. */
export function useSettingsObjectRoute(){
 const [params,setParams]=useSearchParams();
 const requested=params.get('object');
 const [selection,setSelection]=useState({requested,value:requested});
 if(selection.requested!==requested)setSelection({requested,value:requested});
 return {objectId:selection.requested===requested?selection.value:requested,selectObject:(value:string)=>{
  setSelection({requested,value});
  setParams(previous=>{const next=new URLSearchParams(previous);next.set('object',value);return next;},{replace:true});
 }};
}
