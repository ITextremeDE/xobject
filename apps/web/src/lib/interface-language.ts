// Only the last resolved interface language is cached, never account/workspace data.
export const interfaceLanguageKey='xobject:interface-language';
export function initialInterfaceLanguage(saved:string|null,browserLanguage:string):'de'|'en'{
 return saved==='de'||saved==='en'?saved:browserLanguage.toLowerCase().startsWith('de')?'de':'en';
}
export function readInterfaceLanguage(): 'de'|'en'{
 try{return initialInterfaceLanguage(localStorage.getItem(interfaceLanguageKey),navigator.language);}
 catch{return initialInterfaceLanguage(null,navigator.language);}
}
export function rememberInterfaceLanguage(language:string){
 if(language!=='de'&&language!=='en')return;
 try{localStorage.setItem(interfaceLanguageKey,language);}catch{/* Browser storage is optional. */}
}
