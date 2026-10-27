-- retention job deletes by age; keeps scripts/audit-retention.sh from scanning the whole table
CREATE INDEX IF NOT EXISTS audit_log_at_idx ON audit_log (at);
