// Last line of defense for an unattended helm display. React 18 unmounts the
// whole tree on an uncaught render error — without a boundary that's a blank
// white screen at sea with no keyboard to fix it. The default fallback shows a
// plain-language panel and restarts the page after a short delay, with a
// session guard so a crash-on-boot bug can't reload-loop forever.

import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { scheduleCrashReload } from './crashReload';

interface Props {
  children: ReactNode;
  /** Custom fallback; receives a retry callback that remounts the subtree.
   *  When provided, the boundary does NOT auto-reload the page. */
  fallback?: (retry: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  willReload: boolean;
  epoch: number;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, willReload: false, epoch: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Render crash:', error, info.componentStack);
    if (!this.props.fallback) {
      this.setState({ willReload: scheduleCrashReload() });
    }
  }

  private retry = () => {
    this.setState((s) => ({ hasError: false, willReload: false, epoch: s.epoch + 1 }));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback(this.retry);
      return (
        <div className="crash-panel" role="alert">
          <h1 className="crash-panel__title">Something went wrong</h1>
          <p className="crash-panel__body">
            The display hit an error and stopped.{' '}
            {this.state.willReload
              ? 'It will restart itself in a few seconds.'
              : 'Tap the button to restart it.'}
          </p>
          <button className="crash-panel__button" onClick={() => window.location.reload()}>
            Restart now
          </button>
        </div>
      );
    }
    return <Fragment key={this.state.epoch}>{this.props.children}</Fragment>;
  }
}
