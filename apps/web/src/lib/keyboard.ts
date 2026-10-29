// Application shortcuts live here; native widget navigation stays with Base UI.
export const keyboardCommands = {
  save: { key: 'Enter', aria: 'Control+Enter Meta+Enter', label: 'saveShortcut' },
  workspaceSearch: { event: 'xobject:toggle-workspace-search', key: 'k', aria: 'Control+k Meta+k', label: 'workspaceSearchShortcut' },
  search: { key: '/', aria: '/', label: 'searchShortcut' },
} as const;
export const modifierLabel = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
export const workspaceSearchShortcutLabel = `${modifierLabel} K`;
export const saveShortcutLabel = `${modifierLabel} + Enter`;

export function installKeyboardShortcuts() {
  function handleWorkspaceSearch(event: KeyboardEvent) {
    if (event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.shiftKey) return;
    if (event.key.toLowerCase() !== keyboardCommands.workspaceSearch.key || !(event.metaKey || event.ctrlKey)) return;
    const blocked = Array.from(document.querySelectorAll('[role="dialog"]:not([data-nonmodal-panel="true"]), [role="alertdialog"], [role="menu"]')).some(element =>
      !element.hasAttribute('data-workspace-search-dialog') && element.getClientRects().length && !element.hasAttribute('data-ending-style') && !element.hasAttribute('data-closed'));
    if (blocked) { event.preventDefault(); return; }
    const trigger = document.querySelector<HTMLButtonElement>('[data-workspace-search-trigger]');
    if (!trigger || trigger.disabled) return;
    event.preventDefault(); event.stopPropagation(); window.dispatchEvent(new Event(keyboardCommands.workspaceSearch.event));
  }

  function handle(event: KeyboardEvent) {
    if (event.defaultPrevented || event.repeat || event.isComposing || event.altKey) return;
    const target = event.target instanceof Element ? event.target : null;
    if (event.key === keyboardCommands.save.key && (event.ctrlKey || event.metaKey) && !event.shiftKey) {
      const owner = target instanceof HTMLButtonElement || target instanceof HTMLInputElement ? target.form : target?.closest('form');
      if (!(owner instanceof HTMLFormElement) || !owner.hasAttribute('data-shortcut-submit')) return;
      event.preventDefault();
      const submit = Array.from(owner.elements).find(element => element instanceof HTMLButtonElement && element.type === 'submit') as HTMLButtonElement | undefined;
      // requestSubmit preserves native validation and the normal submit handler.
      if (submit && !submit.disabled) owner.requestSubmit(submit);
      return;
    }
    if (event.key !== keyboardCommands.search.key || event.ctrlKey || event.metaKey) return;
    if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]')) return;
    // Search must not steal focus from a menu, dialog or record panel.
    if (Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')).some(element => element.getClientRects().length && !element.hasAttribute('data-ending-style') && !element.hasAttribute('data-closed'))) return;
    const search = document.getElementById('record-search');
    if (search instanceof HTMLInputElement && !search.disabled) {
      event.preventDefault(); search.focus(); search.select();
    }
  }
  // Capture Mod+K before Command's own input navigation or browser search handles it.
  document.addEventListener('keydown', handleWorkspaceSearch, true);
  document.addEventListener('keydown', handle);
  return () => { document.removeEventListener('keydown', handleWorkspaceSearch, true); document.removeEventListener('keydown', handle); };
}
