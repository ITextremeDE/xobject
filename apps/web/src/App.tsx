import { Component, lazy, Suspense, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSession } from '@/lib/api';
import { Login } from '@/components/login';
import { Loading, ErrorNotice } from '@/components/feedback';
const WorkspaceApp = lazy(() => import('@/components/workspace-app').then(module => ({ default: module.WorkspaceApp })));

class WorkspaceBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() { return this.state.error ? <main className="mx-auto max-w-xl p-8"><ErrorNotice error={this.state.error} retry={() => window.location.reload()} /></main> : this.props.children; }
}

export default function App() {
  const client = useQueryClient();
  const session = useQuery({ queryKey: ['session'], queryFn: getSession, retry: false });
  function forgetSession() { void client.cancelQueries(); client.removeQueries({ predicate: query => query.queryKey[0] !== 'session' }); client.setQueryData(['session'], null); }
  useEffect(() => {
    window.addEventListener('xobject:session-expired', forgetSession);
    return () => window.removeEventListener('xobject:session-expired', forgetSession);
  }, [client]);
  if (session.isPending) return <main className="mx-auto max-w-xl pt-24"><Loading /></main>;
  if (session.isError) return <main className="mx-auto max-w-xl p-8"><ErrorNotice error={session.error} retry={() => { void session.refetch(); }} /></main>;
  if (!session.data) return <Login onSuccess={() => { void client.invalidateQueries({ queryKey: ['session'] }); }} />;
  return <WorkspaceBoundary><Suspense fallback={<Loading />}><WorkspaceApp key={session.data.user.id} user={session.data.user} onSignOut={forgetSession} /></Suspense></WorkspaceBoundary>;
}
