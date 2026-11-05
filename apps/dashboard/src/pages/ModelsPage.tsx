import { useEffect, useState } from "react";
import {
  type ApiClient,
  DashboardApiError,
  type ModelsReport,
  parseModels,
} from "../api/client.js";

type Props = {
  readonly client: ApiClient;
};

export function ModelsPage(props: Props) {
  const [report, setReport] = useState<ModelsReport | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void props.client
      .listModels()
      .then((body) => {
        if (!cancelled) {
          setReport(parseModels(body));
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
      <h2>Models</h2>
      {error !== undefined ? <p className="error">{error}</p> : null}
      <p className="muted">
        Snapshot {report?.snapshotId ?? "—"} · {report?.capturedAt ?? ""}
      </p>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Billing</th>
              <th>Optimize for</th>
            </tr>
          </thead>
          <tbody>
            {(report?.models ?? []).map((model) => (
              <tr key={model.id}>
                <td>
                  <strong>{model.label}</strong>
                  <div className="muted">{model.id}</div>
                </td>
                <td>{model.billingCategory}</td>
                <td>{model.optimizeForValues.join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
