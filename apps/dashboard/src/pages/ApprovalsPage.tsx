import { useEffect, useState } from "react";
import {
  type ApiClient,
  DashboardApiError,
  type PendingApprovalView,
  parseApprovals,
} from "../api/client.js";

type Props = {
  readonly client: ApiClient;
};

export function ApprovalsPage(props: Props) {
  const [pending, setPending] = useState<ReadonlyArray<PendingApprovalView>>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void props.client
      .listApprovals()
      .then((body) => {
        if (!cancelled) {
          setPending(parseApprovals(body));
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

  const refresh = () => {
    void props.client
      .listApprovals()
      .then((body) => {
        setPending(parseApprovals(body));
        setError(undefined);
      })
      .catch((err: unknown) => {
        setError(err instanceof DashboardApiError ? err.message : String(err));
      });
  };

  return (
    <section>
      <h2>Approvals</h2>
      <p className="muted">Decisions go through the local API application service.</p>
      {error !== undefined ? <p className="error">{error}</p> : null}
      {message !== undefined ? <p>{message}</p> : null}
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Run</th>
              <th>Kind</th>
              <th>Hash</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pending.map((item) => (
              <tr key={`${item.runId}:${item.subjectHash ?? ""}`}>
                <td>{item.runId}</td>
                <td>{item.kind ?? "—"}</td>
                <td className="muted">{item.subjectHash?.slice(0, 16) ?? "—"}</td>
                <td>
                  <button
                    type="button"
                    className="action"
                    onClick={() => {
                      void props.client
                        .approve(item.runId, "allow")
                        .then(() => {
                          setMessage(`Allowed ${item.runId}`);
                          refresh();
                        })
                        .catch((err: unknown) => {
                          setError(err instanceof DashboardApiError ? err.message : String(err));
                        });
                    }}
                  >
                    Allow
                  </button>{" "}
                  <button
                    type="button"
                    className="action danger"
                    onClick={() => {
                      void props.client
                        .approve(item.runId, "deny")
                        .then(() => {
                          setMessage(`Denied ${item.runId}`);
                          refresh();
                        })
                        .catch((err: unknown) => {
                          setError(err instanceof DashboardApiError ? err.message : String(err));
                        });
                    }}
                  >
                    Deny
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {pending.length === 0 ? <p className="muted">No pending approvals.</p> : null}
      </div>
    </section>
  );
}
