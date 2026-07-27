-- Serialize the top-level Xiaoshouyi sync across manual buttons, cron, and
-- multiple app instances. Per-object run rows remain available for diagnostics;
-- only the coordinator row is unique while it is running.

UPDATE public.external_crm_sync_runs
SET
  status = 'failed',
  finished_at = now(),
  error = COALESCE(error, 'stale sync coordinator expired before single-flight migration')
WHERE source_system = 'xiaoshouyi'
  AND object_api_key = '__sync_lock__'
  AND status = 'running'
  AND started_at < now() - interval '30 minutes';

WITH duplicate_locks AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY source_system
      ORDER BY started_at DESC, id DESC
    ) AS row_number
  FROM public.external_crm_sync_runs
  WHERE object_api_key = '__sync_lock__'
    AND status = 'running'
)
UPDATE public.external_crm_sync_runs AS runs
SET
  status = 'failed',
  finished_at = now(),
  error = COALESCE(runs.error, 'duplicate sync coordinator closed by single-flight migration')
FROM duplicate_locks
WHERE runs.id = duplicate_locks.id
  AND duplicate_locks.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS external_crm_sync_runs_single_flight_idx
  ON public.external_crm_sync_runs (source_system)
  WHERE object_api_key = '__sync_lock__' AND status = 'running';
