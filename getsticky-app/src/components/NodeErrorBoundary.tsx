import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  nodeId?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class NodeErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[NodeErrorBoundary] Node ${this.props.nodeId || 'unknown'} crashed:`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, #2d1b1b 0%, #1a0f0f 100%)',
            border: '1px solid #7f1d1d',
            borderRadius: '12px',
            color: '#fca5a5',
            fontSize: '13px',
            minWidth: '200px',
            maxWidth: '400px',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Node Error
          </div>
          <div style={{ color: '#f87171', fontSize: '12px', lineHeight: '1.5' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: '8px',
              background: 'rgba(127, 29, 29, 0.3)',
              border: '1px solid #7f1d1d',
              color: '#fca5a5',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
