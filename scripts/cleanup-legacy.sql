-- OPTIONAL and DESTRUCTIVE. NOT run by any script. The app no longer has login, so these are unused:
--   users other than local@view.local (old accounts with password hashes), study_grants, institutions.
-- Take a backup first (scripts/db-backup.sh), review the counts, then run:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/cleanup-legacy.sql
-- Annotations authored by a legacy user keep working only if that user row stays: they are reassigned to the local user.
BEGIN;
SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM study_grants) AS grants, (SELECT count(*) FROM institutions) AS institutions;

UPDATE annotations SET author_id = (SELECT id FROM users WHERE email = 'local@view.local')
 WHERE author_id <> (SELECT id FROM users WHERE email = 'local@view.local');
UPDATE audit_log SET user_id = NULL WHERE user_id IS NOT NULL AND user_id <> (SELECT id FROM users WHERE email = 'local@view.local');
-- user_preferences of legacy users go with them (it is per-user UI state only)
DELETE FROM user_preferences WHERE user_id <> (SELECT id FROM users WHERE email = 'local@view.local');
DELETE FROM study_grants;
DELETE FROM users WHERE email <> 'local@view.local';
-- institutions: keep the one the local user belongs to
DELETE FROM institutions WHERE id NOT IN (SELECT institution_id FROM users);
COMMIT;
