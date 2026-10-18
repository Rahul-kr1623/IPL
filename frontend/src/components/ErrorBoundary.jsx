import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('IPL 2026 App Crash Caught by ErrorBoundary:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#070913] text-white flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="relative p-8 rounded-3xl bg-white/[0.03] border border-white/10 max-w-md w-full shadow-2xl backdrop-blur-xl">
            {/* Ambient glow */}
            <div className="absolute -top-12 -left-12 w-32 h-32 bg-ipl-neon/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-red-500/15 rounded-full blur-3xl pointer-events-none" />

            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <h2 className="text-xl font-black uppercase tracking-wider mb-2 text-white">
              IPL 2026 Live Hub
            </h2>
            <p className="text-xs text-gray-400 mb-6 leading-relaxed">
              We encountered a temporary rendering issue while processing live match data.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={this.handleReload}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-ipl-neon text-black text-xs font-black uppercase tracking-wider hover:opacity-90 active:scale-95 transition-all cursor-pointer shadow-lg shadow-ipl-neon/20"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reload Match Feed
              </button>
              <button
                onClick={this.handleReset}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-wider hover:bg-white/10 active:scale-95 transition-all text-gray-300 cursor-pointer"
              >
                <Home className="w-3.5 h-3.5" />
                Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
