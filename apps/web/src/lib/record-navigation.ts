// Return only to the current workspace's Dashboard or the same object list.
// History state is a navigation hint, never an arbitrary redirect target.
export function recordReturnPath(origin: unknown, workspacePath: string, objectPath: string, search: string): string {
  if (typeof origin === 'string') {
    const pathname = origin.split('?')[0];
    if ((pathname === workspacePath || pathname === objectPath) && !origin.includes('#')) return origin;
  }
  return `${objectPath}${search}`;
}
