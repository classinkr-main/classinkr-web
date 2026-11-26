alter table public.admin_requests
  add column submission_fingerprint text check (
    submission_fingerprint is null or submission_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  add column mutation_receipts jsonb not null default '[]'::jsonb check (
    jsonb_typeof(mutation_receipts) = 'array' and jsonb_array_length(mutation_receipts) <= 20
  );
