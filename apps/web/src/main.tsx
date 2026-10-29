import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import App from './App';
import { AppearanceProvider } from './components/preferences';
import './lib/i18n';
import './index.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } });
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><QueryClientProvider client={queryClient}><TooltipProvider><AppearanceProvider><App /></AppearanceProvider></TooltipProvider></QueryClientProvider></React.StrictMode>,
);
