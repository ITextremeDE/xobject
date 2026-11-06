import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutDashboardIcon, DatabaseIcon, FileTextIcon } from 'lucide-react';
import type { WorkspaceAppearance } from '@xobject/contracts';
import { workspaceAppearanceTokens } from '@/lib/workspace-appearance';
import { primaryContrastIssues, resolveThemeColors } from '@/lib/color-contrast';
import { WorkspaceMenuAppearanceProvider } from '@/lib/menu-appearance';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset } from '@/components/ui/sidebar';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { WorkspaceLogo } from './workspace-logo';
import { MenuAppearancePreview } from './menu-appearance-preview';

/** Uses the application's actual primitives. All example state stays inside this preview. */
export function WorkspaceDesignPreview({ appearance, dark }: { appearance: WorkspaceAppearance; dark: boolean }) {
  const { t } = useTranslation();
  const [active, setActive] = useState('dashboard');
  const [selected, setSelected] = useState(false);
  const tokens = workspaceAppearanceTokens(appearance, dark);
  const contrastWarning = Boolean(dark ? appearance.primaryColorDark : appearance.primaryColor) && primaryContrastIssues(resolveThemeColors(tokens)).length > 0;
  const modeStyle = { ...tokens, colorScheme: dark ? 'dark' : 'light' } as CSSProperties;
  return <WorkspaceMenuAppearanceProvider appearance={appearance} dark={dark}>
    <div className="flex min-w-0 flex-col gap-3 text-foreground font-sans" data-slot="workspace-design-preview" style={modeStyle}>
      {contrastWarning ? <Alert><AlertDescription>{t('designContrastWarning')}</AlertDescription></Alert> : null}
      <SidebarProvider className="min-h-0 overflow-hidden rounded-xl border bg-sidebar text-foreground font-sans" style={{ ...modeStyle, '--sidebar-width': '3.25rem' } as CSSProperties}>
        <Sidebar className="h-auto" collapsible="none" aria-label={t('navigation')}>
          <SidebarHeader><div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><WorkspaceLogo icon={appearance.logoIcon} className="size-4" /></div></SidebarHeader>
          <SidebarContent><SidebarMenu>{[
            { key: 'dashboard', label: t('dashboard'), Icon: LayoutDashboardIcon },
            { key: 'objects', label: t('objects'), Icon: DatabaseIcon },
            { key: 'details', label: t('details'), Icon: FileTextIcon },
          ].map(({ key, label, Icon }) => <SidebarMenuItem key={key}><SidebarMenuButton type="button" aria-label={label} isActive={active === key} onClick={() => setActive(key)}><Icon /><span className="sr-only">{label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarContent>
        </Sidebar>
        <SidebarInset className="min-w-0 gap-3 p-3">
          <h3 className="sr-only">{t(dark ? 'dark' : 'light')}</h3>
          <Card size="sm"><CardHeader><CardTitle>{t('details')}</CardTitle><CardDescription>{t('designPreviewText')}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">
            <Input aria-label={t('designPreviewInput')} placeholder={t('designPreviewInput')} />
            <div className="flex flex-wrap gap-2"><Button type="button">{t('designPreviewPrimary')}</Button><Button type="button" variant="secondary">{t('designPreviewSecondary')}</Button></div>
          </CardContent></Card>
          <Table aria-label={t('designSurfacePreview')}><TableHeader><TableRow><TableHead><span className="sr-only">{t('selectPage')}</span></TableHead><TableHead>{t('keyword')}</TableHead></TableRow></TableHeader><TableBody>
            <TableRow data-state={selected ? 'selected' : undefined}><TableCell><Checkbox checked={selected} onCheckedChange={value => setSelected(value === true)} aria-label={t('menuPreviewFirst')} /></TableCell><TableCell><Button type="button" variant="link" size="sm">{t('menuPreviewFirst')}</Button></TableCell></TableRow>
            <TableRow><TableCell /><TableCell>{t('menuPreviewSecond')}</TableCell></TableRow>
          </TableBody></Table>
          <div className="flex flex-col gap-2"><span className="text-sm text-muted-foreground">{t('design_chartColor')}</span><div className="flex gap-2" role="img" aria-label={t('designChartPreview')}>{[1, 2, 3, 4, 5].map(index => <span key={index} className="h-6 flex-1 rounded-sm" style={{ backgroundColor: `var(--chart-${index})` }} />)}</div></div>
          <MenuAppearancePreview />
        </SidebarInset>
      </SidebarProvider>
    </div>
  </WorkspaceMenuAppearanceProvider>;
}
