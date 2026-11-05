import { useEffect, useState } from "react";
import {
  type ApiClient,
  type AuthView,
  DashboardApiError,
  parseAuth,
  parseWorktrees,
  type WorktreeView,
} from "../api/client.js";

type Props = {
  readonly client: ApiClient;
  readonly token: string;
  readonly baseUrl: string;
  readonly onSave: (next: { token: string; baseUrl: string }) => void;
};

export function SettingsPage(props: Props) {
  const [token, setToken] = useState(props.token);
  const [baseUrl, setBaseUrl] = useState(props.baseUrl);
  const [auth, setAuth] = useState<AuthView | undefined>(undefined);
  const [worktrees, setWorktrees] = useState<ReadonlyArray<WorktreeView>>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([props.client.getAuth(), props.client.listWorktrees()])
      .then(([authBody, wtBody]) => {
        if (!cancelled) {
          setAuth(parseAuth(authBody));
          setWorktrees(parseWorktrees(wtBody));
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
      <h2>Settings</h2>
      <p className="muted">
        Dashboard never opens SQLite; configure the local API endpoint and token.
      </p>
      {error !== undefined ? <p className="error">{error}</p> : null}
      <div className="panel token-form">
        <input
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder="API base URL (/api or http://127.0.0.1:7432)"
          aria-label="API base URL"
        />
        <input
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Bearer token"
          aria-label="API token"
          type="password"
        />
        <button type="button" className="action" onClick={() => props.onSave({ token, baseUrl })}>
          Save
        </button>
      </div>
      <div className="panel">
        <h3>Auth probe</h3>
        {auth === undefined ? (
          <p className="muted">Unavailable</p>
        ) : (
          <ul>
            <li>ok={String(auth.ok)}</li>
            <li>runtime={auth.runtimeId}</li>
            <li>sandboxReady={String(auth.sandboxReady)}</li>
            <li>billingOwner={auth.billingOwner}</li>
          </ul>
        )}
      </div>
      <div className="panel">
        <h3>Worktrees</h3>
        <ul>
          {worktrees.map((wt) => (
            <li key={wt.runId}>
              {wt.runId}: {wt.branch ?? "—"} @ {wt.path ?? "—"} ({wt.status})
            </li>
          ))}
        </ul>
        {worktrees.length === 0 ? <p className="muted">No worktrees linked to runs.</p> : null}
      </div>
    </section>
  );
}
