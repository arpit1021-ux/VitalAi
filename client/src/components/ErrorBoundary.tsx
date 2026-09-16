import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Render error caught by ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-ground px-4 py-12">
          <div
            role="alert"
            className="w-full max-w-reading rounded-md border border-ink/[0.07] bg-surface p-6 shadow-card sm:p-8"
          >
            <span
              className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-sunk"
              aria-hidden="true"
            >
              <AlertTriangle className="h-5 w-5 text-ink-muted" />
            </span>
            <h1 className="text-balance font-display text-title text-ink">
              That didn&apos;t load
            </h1>
            <p className="mt-3 text-body-lg text-ink-muted">
              Something broke while drawing this screen. Refreshing usually sorts it. If it keeps
              happening, it&apos;s worth telling us.
            </p>
            <Button size="lg" className="mt-6 w-full sm:w-auto" onClick={() => window.location.reload()}>
              Refresh the page
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
