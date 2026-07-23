import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./index.css";
const required = [
  'VITE_AVID_API_BASE',
  'VITE_COMPANION_SECRET',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
];

const missing = required.filter((key) => !import.meta.env[key]);

if (missing.length) {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="padding:24px;color:#fff;background:#111;font-family:sans-serif;">
        <h1>Missing app configuration</h1>
        <p>The companion app is missing these environment variables:</p>
        <ul>${missing.map((k) => `<li>${k}</li>`).join('')}</ul>
        <p>This build was not packaged correctly. Please rebuild with the correct .env values.</p>
      </div>
    `;
  }
  throw new Error(`Missing env vars: ${missing.join(', ')}`);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
