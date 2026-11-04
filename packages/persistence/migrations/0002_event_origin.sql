-- AEP-021: audit operation origin on journal events
ALTER TABLE workflow_events ADD COLUMN operation_origin TEXT NOT NULL DEFAULT 'aep';
CREATE INDEX workflow_events_actor_idx ON workflow_events(actor);
CREATE INDEX workflow_events_operation_origin_idx ON workflow_events(operation_origin);
