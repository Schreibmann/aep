import { useEffect, useState } from "react";
import {
  type ApiClient,
  DashboardApiError,
  parseRuns,
  parseTimelineEvents,
  type TimelineEvent,
} from "../api/client.ts";

type Props = {
  readonly client: ApiClient;
  readonly runId?: string;
  readonly onSelectRun: (runId: string) => void;
};

export function RunTimelinePage(props: Props) {
  const [events, setEvents] = useState<ReadonlyArray<TimelineEvent>>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [runOptions, setRunOptions] = useState<ReadonlyArray<string>>([]);

  useEffect(() => {
    let cancelled = false;
    void props.client.listRuns().then((body) => {
      if (!cancelled) {
        setRunOptions(parseRuns(body).map((run) => run.runId));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [props.client]);

  useEffect(() => {
    if (props.runId === undefined) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    const load = () => {
      void props.client
        .getEvents(props.runId ?? "")
        .then((body) => {
          if (!cancelled) {
            setEvents(parseTimelineEvents(body));
            setError(undefined);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setError(err instanceof DashboardApiError ? err.message : String(err));
          }
        });
    };
    load();
    const timer = window.setInterval(load, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [props.client, props.runId]);

  return (
    <section>
      <h2>Live run timeline</h2>
      <p className="muted">Safe event text only — no hidden reasoning or secrets.</p>
      <label>
        Run{" "}
        <select
          value={props.runId ?? ""}
          onChange={(event) => {
            if (event.target.value.length > 0) {
              props.onSelectRun(event.target.value);
            }
          }}
        >
          <option value="">Select a run</option>
          {runOptions.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
      {error !== undefined ? <p className="error">{error}</p> : null}
      <div className="panel">
        <ul className="timeline">
          {events.map((event) => (
            <li key={event.id}>
              <span className="muted">{event.at}</span>
              <strong>{event.kind}</strong>
              <span>{event.text}</span>
            </li>
          ))}
        </ul>
        {props.runId === undefined ? (
          <p className="muted">Select a run to stream timeline events.</p>
        ) : null}
        {props.runId !== undefined && events.length === 0 ? (
          <p className="muted">No timeline events yet.</p>
        ) : null}
      </div>
    </section>
  );
}
