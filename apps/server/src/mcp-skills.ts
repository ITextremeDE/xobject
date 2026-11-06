import type { Workspace, WorkspaceModule, ObjectSummary } from '@xobject/contracts';
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/server';
import { SkillsExtension, skillEntry } from '@modelcontextprotocol/server/ext/skills';
import { Application } from './domain.js';
import type { RequestContext } from './api-credentials.js';

const names = ['xobject-foundation','xobject-contacts','xobject-projects','xobject-model-design'] as const;
// Files are part of the application build, never a client-supplied filesystem path.
const source = names.map(name => {
  const text = readFileSync(new URL(`./skills/${name}/SKILL.md`, import.meta.url), 'utf8');
  return { name, text, entry: skillEntry(name, { 'SKILL.md': text }) };
});

export async function attachSkills(server: McpServer, application: Application, context: RequestContext & {userId:string}) {
  async function visibleEntries() {
  const workspaces = await application.execute('list_workspaces', {}, context.userId, context) as Workspace[];
  const allowed = new Set<string>(['xobject-foundation']);
  for (const workspace of workspaces) {
    if (workspace.role === 'administrator' || workspace.role === 'designer') allowed.add('xobject-model-design');
    const modules = await application.execute('list_workspace_modules', { workspaceId: workspace.id }, context.userId, context) as WorkspaceModule[];
    const objects = await application.execute('list_object_types', { workspaceId: workspace.id }, context.userId, context) as ObjectSummary[];
    for (const module of modules) {
      if (module.enabled && module.key !== 'documents' && module.objects.some(item => objects.some(object => object.technicalName === item.technicalName && object.permissions?.read))) {
        allowed.add(`xobject-${module.key}`);
      }
    }
  }
  const entries = await Promise.all(source.filter(item => allowed.has(item.name)).map(async item => ({ ...item, entry: await item.entry })));
  return entries;
  }
  let pending: ReturnType<typeof visibleEntries> | undefined;
  const visible = () => pending ??= visibleEntries();
  new SkillsExtension({ source: {
    list: async () => ({ skills: (await visible()).map(item => item.entry) }),
    get: async uri => (await visible()).find(item => item.entry.uri === uri)?.entry,
    read: async uri => {
      const item = (await visible()).find(item => item.entry.uri === uri);
      return item ? { text: item.text, mimeType: 'text/markdown' } : undefined;
    },
    listResources: async () => (await visible()).map(item => ({ uri: item.entry.uri, name: item.name, mimeType: 'text/markdown', description: item.entry.frontmatter.description })),
  }, cacheHint: { ttlMs: 0, cacheScope: 'private' }, strict: true }).attach(server);
}
