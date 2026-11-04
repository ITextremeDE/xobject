// Return to the current workspace Dashboard, same object list or a linked source record.
// History state is a navigation hint, never an arbitrary redirect target.
export function recordReturnPath(origin: unknown, workspacePath: string, objectPath: string, search: string): string {
  if (typeof origin === 'string') {
    const pathname = origin.split('?')[0];
    const linkedSource=pathname.startsWith(`${workspacePath}/objects/`)&&/^[a-z][a-z0-9_]*\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pathname.slice(`${workspacePath}/objects/`.length));
    if ((pathname === workspacePath || pathname === objectPath||linkedSource) && !origin.includes('#')) return origin;
  }
  return `${objectPath}${search}`;
}
