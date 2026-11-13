import {useCallback,useReducer,type SetStateAction} from 'react';
export type DraftPair<T>={value:T;baseline:T};
export type DraftPairAction<T>={kind:'value'|'baseline';value:SetStateAction<T>}|{kind:'adopt';value:T};
export function draftPairReducer<T>(state:DraftPair<T>,action:DraftPairAction<T>):DraftPair<T>{
 if(action.kind==='adopt')return {value:action.value,baseline:action.value};
 const value=typeof action.value==='function'?(action.value as (old:T)=>T)(state[action.kind]):action.value;
 return Object.is(value,state[action.kind])?state:{...state,[action.kind]:value};
}
/** A business draft owns its baseline and edits together; adoption is an explicit transition. */
export function useDraftPair<T>(initial:T|(()=>T)){
 const [state,dispatch]=useReducer(draftPairReducer<T>,initial,value=>{const current=typeof value==='function'?(value as ()=>T)():value;return {value:current,baseline:current};});
 const setValue=useCallback((value:SetStateAction<T>)=>dispatch({kind:'value',value}),[]);
 const setBaseline=useCallback((value:SetStateAction<T>)=>dispatch({kind:'baseline',value}),[]);
 const adopt=useCallback((value:T)=>dispatch({kind:'adopt',value}),[]);
 return {...state,setValue,setBaseline,adopt,dirty:JSON.stringify(state.value)!==JSON.stringify(state.baseline)};
}
