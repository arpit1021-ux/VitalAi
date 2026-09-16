import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastProvider } from '@/components/shared/Toast';
import { AppShell } from '@/components/shared/AppShell';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <TooltipProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <BrowserRouter>
              <AppShell>
                <App />
              </AppShell>
            </BrowserRouter>
          </ToastProvider>
        </QueryClientProvider>
      </TooltipProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
