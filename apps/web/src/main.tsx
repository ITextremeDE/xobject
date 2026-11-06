import {Toaster} from '@/components/ui/toast';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { Loading } from './components/feedback';
import { AppearanceProvider } from './components/preferences';
import './lib/i18n';
import './index.css';

const router = createBrowserRouter([{ path: '*', HydrateFallback: Loading, lazy: async () => ({ Component: (await import('./App')).default }) }]);
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, refetchOnReconnect:false }, mutations: { retry: false } } });
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><QueryClientProvider client={queryClient}><TooltipProvider><AppearanceProvider><Toaster timeout={3500} limit={3}><RouterProvider router={router} /></Toaster></AppearanceProvider></TooltipProvider></QueryClientProvider></React.StrictMode>,
);
