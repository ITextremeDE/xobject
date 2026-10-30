import { createContext, useContext, useSyncExternalStore, type ReactNode, type CSSProperties } from 'react';
import { defaultWorkspaceAppearance, type WorkspaceAppearance } from '@xobject/contracts';
import { workspaceMenuTokens } from './workspace-appearance';

const MenuAppearanceContext = createContext<{ appearance: WorkspaceAppearance; dark?: boolean }>({ appearance: defaultWorkspaceAppearance });
export function WorkspaceMenuAppearanceProvider({ appearance = defaultWorkspaceAppearance, dark, children }: { appearance?: WorkspaceAppearance; dark?: boolean; children: ReactNode }) {
  return <MenuAppearanceContext.Provider value={{ appearance, dark }}>{children}</MenuAppearanceContext.Provider>;
}
const subscribeDark = (notify: () => void) => {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
};
const currentDark = () => document.documentElement.classList.contains('dark');
/** React context survives portals, so draft light/dark samples never borrow the saved page design. */
export function useMenuAppearance() {
  const context = useContext(MenuAppearanceContext);
  const dark = useSyncExternalStore(subscribeDark, currentDark, () => false);
  const menu = workspaceMenuTokens(context.appearance, context.dark ?? dark);
  return { dark: menu.dark, style: menu.style as CSSProperties };
}
