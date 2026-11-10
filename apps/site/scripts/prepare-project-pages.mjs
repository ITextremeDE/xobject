import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root=new URL('../../../',import.meta.url),output=new URL('../src/content/project/generated/',import.meta.url);
await mkdir(output,{recursive:true});
for(const [slug,file,title] of [['changelog','CHANGELOG.md','Changelog'],['roadmap','ROADMAP.md','Roadmap']]){
 let content=(await readFile(new URL(file,root),'utf8')).replace(/^# .+\r?\n/,'');
 content=content.replace(/\]\(([^)]+)\)/g,(whole,url)=>{
  if(/^(?:[a-z]+:|#|\/)/i.test(url))return whole;
  const [target,hash]=url.split('#'),fragment=hash?'#'+hash:'';
  if(target==='CHANGELOG.md'||target==='ROADMAP.md')return `](/${target==='CHANGELOG.md'?'changelog':'roadmap'}/${fragment})`;
  const rootDocs={'README.md':'','CONTRIBUTING.md':'contributing/','SECURITY.md':'security/','LICENSE':'license/'};
  if(Object.hasOwn(rootDocs,target))return `](https://docs.xobject.org/${rootDocs[target]}${fragment})`;
  if(target.startsWith('docs/')&&target.endsWith('.md')){
   const route=target==='docs/README.md'?'documentation-index':target.slice(5,-3).toLowerCase();
   return `](https://docs.xobject.org/${route}/${fragment})`;
  }
  return `](https://github.com/ITextremeDE/xobject/blob/main/${target}${fragment})`;
 });
 await writeFile(new URL(`${slug}.md`,output),`---\ntitle: ${JSON.stringify(title)}\n---\n${content}`);
}
console.log('Generated canonical changelog and roadmap website pages.');
