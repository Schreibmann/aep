import { useEffect, useState } from "react";
import { type ApiClient, DashboardApiError, parseRuns, type RunSummary } from "../api/client.js";

type Props = {
  readonly client: ApiClient;
  readonly onOpenRun: (runId: string) => void;
};

export function ProjectsPage(props: Props) {
  const [runs, setRuns] = useState<ReadonlyArray<RunSummary>>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void props.client
      .listRuns()
      .then((body) => {
        if (!cancelled) {
          setRuns(parseRuns(body));
          setError(undefined);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof DashboardApiError ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [props.client]);

  const projects = [...new Set(runs.map((run) => run.taskDescription.split(":")[0] ?? "local"))];

  return (
    <section>
      <h2>Projects</h2>
      <p className="muted">Derived from recent runs (no direct SQLite access).</p>
      {error !== undefined ? <p className="error">{error}</p> : null}
      <div className="grid two">
        {projects.map((name) => {
          const related = runs.filter((run) => run.taskDescription.startsWith(name));
          return (
            <article key={name} className="panel">
              <h3>{name || "local"}</h3>
              <p className="muted">{related.length} run(s)</p>
              <ul>
                {related.slice(0, 5).map((run) => (
                  <li key={run.runId}>
                    <button
                      type="button"
                      className="action"
                      onClick={() => props.onOpenRun(run.runId)}
                    >
                      {run.runId}
                    </button>{" "}
                    <span className="muted">{run.status}</span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
