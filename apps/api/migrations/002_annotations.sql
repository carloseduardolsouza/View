-- one row per drawn annotation; version increments on every change, full history kept below
CREATE TABLE annotations (
  uid text PRIMARY KEY,                       -- Cornerstone annotationUID
  study_uid text NOT NULL,
  series_uid text,
  image_id text,                              -- referencedImageId (wadors URL), used to jump to the slice
  tool text NOT NULL,
  data jsonb NOT NULL,
  author_id uuid NOT NULL REFERENCES users(id),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX annotations_study_idx ON annotations(study_uid) WHERE deleted_at IS NULL;
CREATE TABLE annotation_history (
  id bigserial PRIMARY KEY,
  annotation_uid text NOT NULL,
  version integer NOT NULL,
  op text NOT NULL CHECK (op IN ('create','update','delete')),
  data jsonb,
  user_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE user_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  doc jsonb NOT NULL DEFAULT '{}'
);
