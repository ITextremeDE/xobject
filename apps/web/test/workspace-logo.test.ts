import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {workspaceLogoIcons,workspaceLogoIconGroups,workspaceAppearanceSchema,defaultWorkspaceAppearance} from '@xobject/contracts';
import {WorkspaceLogo} from '../src/components/workspace-logo';

test('every selectable workspace icon validates and renders, including Skull and all released icons',()=>{
 assert.equal(new Set(workspaceLogoIcons).size,workspaceLogoIcons.length);
 assert.equal(workspaceLogoIconGroups.length,6);
 for(const icon of ['layers','building','briefcase','blocks','folder','users','network','globe','rocket','code','landmark','wrench','skull'])assert.ok((workspaceLogoIcons as readonly string[]).includes(icon));
 for(const icon of workspaceLogoIcons){
  assert.equal(workspaceAppearanceSchema.safeParse({...defaultWorkspaceAppearance,logoIcon:icon}).success,true);
  const markup=renderToStaticMarkup(createElement(WorkspaceLogo,{icon}));
  assert.match(markup,/<svg/);assert.match(markup,/aria-hidden="true"/);assert.match(markup,/<path|<circle|<rect|<polygon|<polyline|<line/);
 }
 assert.equal(workspaceAppearanceSchema.safeParse({...defaultWorkspaceAppearance,logoIcon:'arbitrary-external-icon'}).success,false);
});
