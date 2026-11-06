import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
const Context=createContext<{pending:boolean;setPending:(id:string,pending:boolean)=>void}|null>(null);
/** Unapplied dialog selections participate in the same refresh/navigation guard as forms. */
export function TransientDraftProvider({children}:{children:ReactNode}){
 const [ids,setIds]=useState<Set<string>>(()=>new Set());
 const setPending=useCallback((id:string,pending:boolean)=>setIds(old=>{if(old.has(id)===pending)return old;const next=new Set(old);if(pending)next.add(id);else next.delete(id);return next;}),[]);
 const value=useMemo(()=>({pending:ids.size>0,setPending}),[ids,setPending]);return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useTransientDraftPending=()=>useContext(Context)?.pending??false;
export function useTransientDraft(id:string,pending:boolean){
 const setPending=useContext(Context)?.setPending;
 useEffect(()=>{setPending?.(id,pending);return()=>setPending?.(id,false);},[id,pending,setPending]);
}
