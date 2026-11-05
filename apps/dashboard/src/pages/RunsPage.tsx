import { useEffect, useState } from "react";
import { type ApiClient, DashboardApiError, parseRuns, type RunSummary } from "../api/client.js";

type Props = {
  readonly client: ApiClient;
  readonly onOpenRun: (runId: string) => void;
};

export function RunsPage(props: Props) {
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

  return (
    <section>
      <h2>Runs</h2>
      {error !== undefined ? <p className="error">{error}</p> : null}
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Run</th>
              <th>Status</th>
              <th>Risk</th>
              <th>Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.runId}>
                <td>
                  <strong>{run.runId}</strong>
                  <div className="muted">{run.taskDescription}</div>
                </td>
                <td>{run.status}</td>
                <td>{run.risk ?? "—"}</td>
                <td>{run.updatedAt}</td>
                <td>
                  <button
                    type="button"
                    className="action"
                    onClick={() => props.onOpenRun(run.runId)}
                  >
                    Timeline
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {runs.length === 0 ? <p className="muted">No runs yet.</p> : null}
      </div>
    </section>
  );
}
