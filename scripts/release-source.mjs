import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const publicDirectories=new Set(['apps','packages','scripts','docs','deploy','.github']);
const publicRootFiles=new Set(['.dockerignore','.env.example','.gitignore','AGENTS.md','CLAUDE.md','CHANGELOG.md','CONTRIBUTING.md','Dockerfile','LICENSE','NOTICE','README.md','ROADMAP.md','SECURITY.md','package.json','package-lock.json']);
const examples=new Set(['.env.example','deploy/selfhost.env.example']);
/** A commit is the source boundary; these exclusions also reject tracked recovery files. */
export function isPublicSourcePath(file){
 if(file.includes('\n')||file.includes('\r')||file.startsWith('/')||file.split('/').includes('..'))throw Error('Unsupported archive path');
 if(examples.has(file))return true;
 if(/(^|\/)(?:\.git|\.local|node_modules|dist|\.astro|coverage|backups|recovery)(?:\/|$)/.test(file))return false;
 if(/(?:^|\/)(?:\.env(?:$|\.)|[^/]+\.env(?:$|\.))|\.(?:dump|backup|pem|key)(?:$|\.)/.test(file))return false;
 return file.includes('/')?publicDirectories.has(file.split('/')[0]):publicRootFiles.has(file);
}
const git=(root,args,encoding='utf8')=>execFileSync('git',args,{cwd:root,encoding,stdio:['ignore','pipe','pipe'],maxBuffer:32*1024*1024});
export function releaseSourceSnapshot(root){
 const commit=git(root,['rev-parse','--verify','HEAD^{commit}']).trim();
 if(git(root,['diff','--name-only','HEAD','--']).trim())throw Error('Commit or discard tracked changes before preparing a release candidate');
 const untracked=git(root,['ls-files','--others','--exclude-standard','-z']).split('\0').filter(Boolean);
 if(untracked.some(isPublicSourcePath))throw Error('Commit or remove untracked public source files before preparing a release candidate');
 const entries=git(root,['ls-tree','-rz','--full-tree',commit]).split('\0').filter(Boolean).map(row=>{
  const separator=row.indexOf('\t'),metadata=row.slice(0,separator).split(' ');return {mode:metadata[0],kind:metadata[1],file:row.slice(separator+1)};
 }).filter(entry=>isPublicSourcePath(entry.file));
 for(const entry of entries)if(entry.kind!=='blob'||!['100644','100755'].includes(entry.mode))throw Error(`Archive requires a regular committed file: ${entry.file}`);
 const source=entries.map(({file})=>({path:file,sha256:createHash('sha256').update(git(root,['show',`${commit}:${file}`],null)).digest('hex')}));
 return {commit,source};
}
export function archiveReleaseSource(root,snapshot,output){
 if(!snapshot.source.length)throw Error('No public source files selected');
 git(root,['archive','--format=tar.gz',`--output=${output}`,snapshot.commit,'--',...snapshot.source.map(file=>file.path)]);
}
