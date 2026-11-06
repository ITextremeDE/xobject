export const browserDefaults={name:'xObject',description:'Connected data, contacts and projects in one workspace.'};
export function escapeHTML(value:string){return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));}
export function browserShell(source:string,origin:string,name=browserDefaults.name,description=browserDefaults.description){
 return source.replaceAll('__APP_NAME__',escapeHTML(name)).replaceAll('__APP_DESCRIPTION__',escapeHTML(description)).replaceAll('__APP_ORIGIN__',escapeHTML(origin));
}
export function webManifest(name:string){return {id:'/',name,short_name:name.slice(0,24),description:browserDefaults.description,lang:'en',start_url:'/',scope:'/',display:'standalone',background_color:'#ffffff',theme_color:'#171717',icons:[{src:'/icons/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},{src:'/icons/maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]};}
