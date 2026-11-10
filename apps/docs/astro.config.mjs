import {defineConfig} from 'astro/config';
import starlight from '@astrojs/starlight';
const version=process.env.XOBJECT_DOCS_VERSION;
if(version&&!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version))throw new Error('Invalid documentation version');
export default defineConfig({
  site:'https://docs.xobject.org',base:version?`/versions/${version}`:'/',
  redirects:version?{}:{'/changelog':'https://xobject.org/changelog/','/roadmap':'https://xobject.org/roadmap/'},
  integrations:[starlight({
    title:'xObject',description:'Connected business data — Community documentation',
    social:[{icon:'external',label:'xObject by ITextreme',href:'https://xobject.org/'},{icon:'github',label:'GitHub',href:'https://github.com/ITextremeDE/xobject'}],
    customCss:['./src/styles/custom.css'],
    components:{Search:'./src/components/Search.astro',PageTitle:'./src/components/PageTitle.astro'},
    sidebar:[
      {label:'Start here',items:[{label:'Documentation',link:'/'},{label:'First steps',slug:'first-steps'},{label:'User guide',slug:'user-guide'}]},
      {label:'Install & operate',items:[{label:'Self-hosting & recovery',slug:'self-hosting'},{label:'Documentation versions',slug:'versions'},{label:'Security',slug:'security'}]},
      {label:'Integrations',items:[{label:'API & MCP',slug:'api'},{label:'Agent skills',slug:'agent-plugin'}]},
      {label:'Development & reference',collapsed:true,items:[{label:'Development',slug:'development'},{label:'Requirements',slug:'prd'},{label:'Domain profiles',slug:'domain-profiles'},{label:'Terms & actors',link:'/prd/#2-terms-and-actors'},{label:'Architecture index',slug:'documentation-index'},{label:'Demo data',slug:'demo-data'},{label:'Quality acceptance',slug:'quality-acceptance'},{label:'Releasing',slug:'releasing'},{label:'Contributing',slug:'contributing'}]},
      {label:'Project',items:[...(version?[{label:'Changelog',slug:'changelog'},{label:'Roadmap',slug:'roadmap'}]:[{label:'Changelog',link:'https://xobject.org/changelog/'},{label:'Roadmap',link:'https://xobject.org/roadmap/'}]),{label:'License',slug:'license'}]},
      {label:'Architecture decisions',items:[{autogenerate:{directory:'adr'}}],collapsed:true},
    ],
  })],
});
