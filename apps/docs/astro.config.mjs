import {defineConfig} from 'astro/config';
import starlight from '@astrojs/starlight';
const version=process.env.XOBJECT_DOCS_VERSION;
if(version&&!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version))throw new Error('Invalid documentation version');
export default defineConfig({
  site:'https://docs.xobject.org',base:version?`/versions/${version}`:'/',
  integrations:[starlight({
    title:'xObject',description:'Connected business data — Community documentation',
    social:[{icon:'external',label:'xObject by ITextreme',href:'https://xobject.org/'},{icon:'github',label:'GitHub',href:'https://github.com/ITextremeDE/xobject'}],
    customCss:['./src/styles/custom.css'],
    components:{Search:'./src/components/Search.astro'},
    sidebar:[
      {label:'Start here',items:[{label:'Overview',link:'/'},{label:'Using xObject',slug:'user-guide'},{label:'Self-hosting & recovery',slug:'self-hosting'},{label:'API & MCP',slug:'api'},{label:'Agent plugin',slug:'agent-plugin'}]},
      {label:'Reference',items:[{label:'Requirements',slug:'prd'},{label:'Domain profiles',slug:'domain-profiles'},{label:'Terms & actors',link:'/prd/#2-terms-and-actors'},{label:'Development',slug:'development'},{label:'Demo data',slug:'demo-data'}]},
      {label:'Project',items:[{label:'Changelog',slug:'changelog'},{label:'Roadmap',slug:'roadmap'},{label:'Contributing',slug:'contributing'},{label:'Security',slug:'security'},{label:'License',slug:'license'},{label:'Documentation versions',slug:'versions'},{label:'Quality acceptance',slug:'quality-acceptance'},{label:'Releasing',slug:'releasing'}]},
      {label:'Architecture decisions',items:[{autogenerate:{directory:'adr'}}],collapsed:true},
    ],
  })],
});
