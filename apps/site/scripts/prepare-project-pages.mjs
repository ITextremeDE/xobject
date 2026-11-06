import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root=new URL('../../../',import.meta.url),output=new URL('../src/content/project/generated/',import.meta.url);
await mkdir(output,{recursive:true});
for(const [slug,file,title] of [['changelog','CHANGELOG.md','Changelog'],['roadmap','ROADMAP.md','Roadmap']]){
 let content=await readFile(new URL(file,root),'utf8');
 content=content.replace(/\]\(([^)]+)\)/g,(whole,url)=>{if(/^(?:[a-z]+:|#|\/)/i.test(url))return whole;const [target,hash]=url.split('#');if(target==='CHANGELOG.md'||target==='ROADMAP.md')return `](/${target==='CHANGELOG.md'?'changelog':'roadmap'}/${hash?'#'+hash:''})`;return `](https://github.com/ITextremeDE/xobject/blob/main/${target}${hash?'#'+hash:''})`;});
 await writeFile(new URL(`${slug}.md`,output),`---\ntitle: ${JSON.stringify(title)}\n---\n${content}`);
}
console.log('Generated canonical changelog and roadmap website pages.');
