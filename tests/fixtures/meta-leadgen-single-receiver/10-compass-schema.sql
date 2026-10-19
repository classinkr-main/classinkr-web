-- [Compass 소유] scripts/schema.sql 끝에 추가(추가만, 멱등). META-RECEIVER-FINAL §3-1.
-- 메타 leadgen 제출 1건 = 1행. 웹훅·재처리 크론이 리드 저장 트랜잭션 안(savepoint, 실패해도 던지지 않음)에서 쓴다.
-- lead_id 에 FK 를 걸지 않는다 — 첫 배포에서 crm.leads 에 SHARE ROW EXCLUSIVE 잠금을 잡지 않게(C-db F4). 링크 정본은 crm.lead_refs.
-- form_answers = field_data 중 이름·전화·이메일로 쓴 필드를 뺀 나머지(crm 안 사본). 어드민 뷰는 허용 키만 45일 창으로 연다. 45일 뒤 비운다.
create table if not exists crm.meta_leadgen_submissions (
  leadgen_id    text primary key,
  lead_id       integer,
  outcome       text not null check (outcome in ('created','reinflow','original')),
  via           text check (via in ('webhook','replay')),
  ad_id         text,
  ad_name       text,
  adset_id      text,
  adset_name    text,
  campaign_id   text,
  campaign_name text,
  form_id       text,
  page_id       text,
  platform      text,
  submitted_at  timestamptz,
  received_at   timestamptz not null default now(),
  form_answers  jsonb
);
create index if not exists meta_leadgen_submissions_received_idx on crm.meta_leadgen_submissions(received_at);
create index if not exists meta_leadgen_submissions_lead_idx on crm.meta_leadgen_submissions(lead_id);

-- 증인·폼 스윕으로 실패 보관에 넣은 leadgen 을 한 번만 넣게 하는 표식. 사람이 보관 행을 지워도 다시 넣지 않는다.
create table if not exists crm.meta_leadgen_gap_imports (
  leadgen_id  text primary key,
  source      text not null check (source in ('witness','form_sweep')),
  imported_at timestamptz not null default now()
);
