import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="card text-center py-12">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-400/10 mb-4">
            <svg className="w-7 h-7 text-red-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="font-display text-lg text-parchment mb-2">页面出错了</p>
          <p className="text-parchment-dim/50 text-sm mb-1 max-w-md mx-auto">
            {this.state.error?.message || '发生了未知错误'}
          </p>
          <div className="flex gap-3 justify-center mt-5">
            <button onClick={this.handleReset} className="btn-primary text-sm">
              重试
            </button>
            <a href="/" className="btn-secondary text-sm">
              返回首页
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
