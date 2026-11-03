import {createContext, useContext, useState, type ReactNode} from 'react';
const User = createContext<string | null>(null);
export function TablePreferencesProvider({userId,children}:{userId:string;children:ReactNode}) {return <User.Provider value={userId}>{children}</User.Provider>;}
export function readColumnPreferences(raw:string|null):Record<string,boolean> {
  try {const value=raw&&raw.length<20000?JSON.parse(raw):null;return value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).filter((entry):entry is [string,boolean]=>typeof entry[1]==='boolean')):{};}catch{return {};}
}
// Local presentation preferences only: scoped to account and immutable view/object identities.
export function useColumnPreferences(scope:string,columns:{key:string;required?:boolean}[],defaultHidden:string[]=[]) {
  const userId=useContext(User),key=userId?`xobject:columns:v1:${userId}:${scope}`:null;
  const read=()=>{try{return key?readColumnPreferences(localStorage.getItem(key)):{};}catch{return {};}};
  const [state,setState]=useState(()=>({key,choices:read()}));
  const choices=state.key===key?state.choices:read();
  const hidden=new Set(columns.filter(c=>!c.required&&(Object.hasOwn(choices,c.key)?choices[c.key]:defaultHidden.includes(c.key))).map(c=>c.key));
  const toggle=(column:string)=>{const next={...choices,[column]:!hidden.has(column)};setState({key,choices:next});try{if(key)localStorage.setItem(key,JSON.stringify(next));}catch{/* Storage may be disabled; the current view still works. */}};
  return {hidden,toggle};
}
