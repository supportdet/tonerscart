-- Wave 77 — admin audit log + impersonation tracking.
-- Run once via Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS audit_log (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id        uuid,
    actor_email     text,
    action          text NOT NULL,
    target_id       uuid,
    target_email    text,
    path            text,
    method          text,
    metadata        jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_actor_idx  ON audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_target_idx ON audit_log (target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action, created_at DESC);
