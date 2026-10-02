import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Hata mesajının başında gösterilecek bağlam ("Belge görüntülenemedi"). */
  label: string;
}

interface State {
  error: Error | null;
}

/** Bir belgenin görüntüleyicisi çökerse yalnızca o sekmede hata gösterir; uygulama çalışmaya devam eder. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(this.props.label, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="msg error reader-notice">
        <span>
          {this.props.label}: {this.state.error.message}
        </span>
        <button className="secondary" onClick={() => this.setState({ error: null })}>
          Tekrar dene
        </button>
      </div>
    );
  }
}
