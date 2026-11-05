import { useEffect, useState } from "react";
import {
  type ApiClient,
  DashboardApiError,
  parseUsageEntries,
  type UsageEntry,
} from "../api/client.ts";
import { aggregateEconomy } from "../economy.ts";

type Props = {
  readonly client: ApiClient;
};

export function EconomyPage(props: Props) {
  const [entries, setEntries] = useState<ReadonlyArray<UsageEntry>>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void props.client
      .listUsage()
      .then((body) => {
        if (!cancelled) {
          setEntries(parseUsageEntries(body));
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

  const buckets = aggregateEconomy(entries);

  return (
    <section>
      <h2>Economy</h2>
      <p className="muted">
        Token counts, provider-reported charges, plan-included usage, and unknown costs stay in
        separate categories. Estimated dollars require an explicit rate snapshot.
      </p>
      {error !== undefined ? <p className="error">{error}</p> : null}
      <div className="grid two">
        {buckets.map((bucket) => (
          <article key={bucket.category} className="panel">
            <h3>{bucket.label}</h3>
            <p>Entries: {bucket.entryCount}</p>
            {bucket.category === "tokens" ? (
              <p>
                in={bucket.inputTokens} · out={bucket.outputTokens}
              </p>
            ) : null}
            {bucket.billedUsdTotal !== undefined ? <p>billedUsd={bucket.billedUsdTotal}</p> : null}
            <ul>
              {bucket.notes.map((note) => (
                <li key={note} className="muted">
                  {note}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
