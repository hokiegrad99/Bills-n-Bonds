import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  pageName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.pageName ? ` — ${this.props.pageName}` : ''}]`, error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] px-6 text-center">
          <div className="card p-8 max-w-md w-full">
            <div className="flex justify-center mb-4">
              <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle size={24} className="text-red-600 dark:text-red-400" />
              </div>
            </div>
            <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-1">
              {this.props.pageName
                ? `The ${this.props.pageName} page encountered an error.`
                : 'This section encountered an error.'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 font-mono break-all">
              {this.state.error?.message ?? 'Unknown error'}
            </p>
            <div className="flex justify-center gap-2">
              <button className="btn-primary" onClick={this.handleReset}>
                <RefreshCw size={14} /> Try again
              </button>
              <button className="btn-secondary" onClick={() => window.location.hash = '/'}>
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
