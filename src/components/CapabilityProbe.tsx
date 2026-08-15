import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type CapabilityReport = {
  app_version: string;
  os: string;
  xplane: {
    installed: boolean;
    bridge_reachable: boolean;
    path: string | null;
  };
  msfs2024: {
    reachable: boolean;
    simconnect: boolean;
    wasm_module: boolean;
    note: string;
  };
  pmdg: {
    data_broadcast: boolean;
    note: string;
  };
  api: {
    reachable: boolean;
    bearer_ok: boolean;
    url: string;
  };
};

export function CapabilityProbe({ apiUrl, bearer }: { apiUrl: string; bearer: string | null }) {
  const [report, setReport] = useState<CapabilityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<CapabilityReport>("probe_capabilities", {
        apiUrl,
        bearer,
      });
      setReport(res);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    run();
  }, [apiUrl, bearer]);

  const indicator = (ok: boolean, label: string) => (
    <div className="flex items-center justify-between rounded border border-white/10 bg-white/5 px-3 py-2 text-sm">
      <span className="text-white/80">{label}</span>
      <span className={ok ? "text-emerald-400" : "text-amber-400"}>
        {ok ? "Good" : "Missing"}
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white/90">Capability Probe</h2>
        <button
          onClick={run}
          disabled={loading}
          className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {loading ? "Probing…" : "Re-run Probe"}
        </button>
      </div>

      {error && (
        <pre className="whitespace-pre-wrap rounded border border-red-500/40 bg-red-950/20 p-3 text-xs text-red-100">
          {error}
        </pre>
      )}

      {report && (
        <div className="space-y-4">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50">App</h3>
            <div className="grid grid-cols-2 gap-2">
              {indicator(true, `Version: ${report.app_version}`)}
              {indicator(true, `OS: ${report.os}`)}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50">
              X-Plane 12
            </h3>
            <div className="space-y-2">
              {indicator(report.xplane.installed, "Installation detected")}
              {indicator(report.xplane.bridge_reachable, "Bridge reachable")}
              {report.xplane.path && (
                <p className="text-xs text-white/40">Path: {report.xplane.path}</p>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50">
              MSFS 2024
            </h3>
            <div className="space-y-2">
              {indicator(report.msfs2024.reachable, "Sim reachable")}
              {indicator(report.msfs2024.simconnect, "SimConnect")}
              {indicator(report.msfs2024.wasm_module, "WASM module")}
              <p className="text-xs text-white/50">{report.msfs2024.note}</p>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50">
              PMDG 777
            </h3>
            {indicator(report.pmdg.data_broadcast, "Data Broadcast")}
            <p className="text-xs text-white/50">{report.pmdg.note}</p>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50">
              Device Link / API
            </h3>
            <div className="space-y-2">
              {indicator(report.api.reachable, "API reachable")}
              {indicator(report.api.bearer_ok, "Bearer token set")}
              <p className="text-xs text-white/40">URL: {report.api.url}</p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
