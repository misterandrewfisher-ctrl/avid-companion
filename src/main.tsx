import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

function FatalScreen({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="min-h-screen bg-[#0b0f14] text-[#e6edf3] p-8 font-sans">
      <div className="mx-auto max-w-2xl rounded-lg border border-red-500/40 bg-red-950/20 p-6 shadow-xl">
        <p className="text-sm uppercase tracking-[0.2em] text-red-300">Avid Companion</p>
        <h1 className="mt-3 text-2xl font-semibold">{title}</h1>
        {detail && (
          <pre className="mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md bg-black/40 p-4 text-sm text-red-100">
            {detail}
          </pre>
        )}
        <p className="mt-4 text-sm text-white/70">
          The app rendered this diagnostic screen instead of going blank. Rebuild with the corrected package and send this message if it appears again.
        </p>
      </div>
    </div>
  );
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Avid Companion render failure", error);
  }

  render() {
    if (this.state.error) {
      return <FatalScreen title="The app hit a render error" detail={this.state.error.stack ?? this.state.error.message} />;
    }
    return this.props.children;
  }
}

function describeUnknownError(error: unknown) {
  if (error instanceof Error) return error.stack ?? error.message;
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

async function boot() {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    document.body.innerHTML = "<div style='padding:24px;color:white;background:#0b0f14'>Avid Companion could not find the root element.</div>";
    return;
  }

  const root = ReactDOM.createRoot(rootElement);

  window.addEventListener("error", (event) => {
    console.error("Avid Companion window error", event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    console.error("Avid Companion unhandled promise rejection", event.reason);
  });

  try {
    const { App } = await import("./App");
    root.render(
      <React.StrictMode>
        <RootErrorBoundary>
          <App />
        </RootErrorBoundary>
      </React.StrictMode>,
    );
  } catch (error) {
    console.error("Avid Companion startup failure", error);
    root.render(
      <FatalScreen
        title="The app could not start"
        detail={describeUnknownError(error)}
      />,
    );
  }
}

void boot();
