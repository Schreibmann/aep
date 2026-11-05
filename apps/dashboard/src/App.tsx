import { useMemo, useState } from "react";
import { createApiClient } from "./api/client.js";
import { ApprovalsPage } from "./pages/ApprovalsPage.js";
import { EconomyPage } from "./pages/EconomyPage.js";
import { ModelsPage } from "./pages/ModelsPage.js";
import { ProjectsPage } from "./pages/ProjectsPage.js";
import { RunsPage } from "./pages/RunsPage.js";
import { RunTimelinePage } from "./pages/RunTimelinePage.js";
import { SettingsPage } from "./pages/SettingsPage.js";

export type PageId =
  | "projects"
  | "runs"
  | "timeline"
  | "approvals"
  | "models"
  | "economy"
  | "settings";

const PAGE_LABELS: Record<PageId, string> = {
  projects: "Projects",
  runs: "Runs",
  timeline: "Live timeline",
  approvals: "Approvals",
  models: "Models",
  economy: "Economy",
  settings: "Settings",
};

function readInitialToken(): string {
  const fromEnv = import.meta.env.VITE_AEP_API_TOKEN;
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  const stored = window.localStorage.getItem("aep.dashboard.token");
  return stored ?? "";
}

function readInitialBase(): string {
  const fromEnv = import.meta.env.VITE_AEP_API_BASE;
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv.trim().replace(/\/$/, "");
  }
  return "/api";
}

export function App() {
  const [page, setPage] = useState<PageId>("runs");
  const [token, setToken] = useState(readInitialToken);
  const [baseUrl, setBaseUrl] = useState(readInitialBase);
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(undefined);

  const client = useMemo(
    () =>
      createApiClient({
        baseUrl,
        token,
      }),
    [baseUrl, token],
  );

  const openTimeline = (runId: string) => {
    setSelectedRunId(runId);
    setPage("timeline");
  };

  return (
    <div className="app-shell">
      <nav>
        <h1>AEP</h1>
        <p className="muted">Local dashboard · API only</p>
        {(Object.keys(PAGE_LABELS) as PageId[]).map((id) => (
          <button
            key={id}
            type="button"
            aria-current={page === id ? "page" : undefined}
            onClick={() => setPage(id)}
          >
            {PAGE_LABELS[id]}
          </button>
        ))}
      </nav>
      <main>
        {page === "projects" ? <ProjectsPage client={client} onOpenRun={openTimeline} /> : null}
        {page === "runs" ? <RunsPage client={client} onOpenRun={openTimeline} /> : null}
        {page === "timeline" ? (
          <RunTimelinePage
            client={client}
            {...(selectedRunId === undefined ? {} : { runId: selectedRunId })}
            onSelectRun={setSelectedRunId}
          />
        ) : null}
        {page === "approvals" ? <ApprovalsPage client={client} /> : null}
        {page === "models" ? <ModelsPage client={client} /> : null}
        {page === "economy" ? <EconomyPage client={client} /> : null}
        {page === "settings" ? (
          <SettingsPage
            client={client}
            token={token}
            baseUrl={baseUrl}
            onSave={(next) => {
              setToken(next.token);
              setBaseUrl(next.baseUrl.replace(/\/$/, ""));
              window.localStorage.setItem("aep.dashboard.token", next.token);
            }}
          />
        ) : null}
      </main>
    </div>
  );
}
