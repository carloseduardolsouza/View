CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE
);
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id),
  role text NOT NULL CHECK (role IN ('admin','reader'))
);
-- which studies an institution may open (server-side authorization source of truth)
CREATE TABLE study_grants (
  institution_id uuid NOT NULL REFERENCES institutions(id),
  study_uid text NOT NULL,
  PRIMARY KEY (institution_id, study_uid)
);
CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  action text NOT NULL,
  study_uid text,
  allowed boolean NOT NULL,
  ip text
);
