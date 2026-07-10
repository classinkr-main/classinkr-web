-- 홈페이지(공개 채널) 리드는 확인 전까지 CRM 리드 기본 화면에서 숨긴다.
-- confirmed_at IS NULL = 아직 검토 안 된 리드. 어드민 수기 등록은 즉시 확정,
-- 공개 폼 제출(문의·데모·뉴스레터·Meta 리드애즈 등)은 NULL로 들어와 "확인" 액션
-- 또는 상태 변경(new -> contacted/converted/closed) 시 자동으로 채워진다.
alter table leads
  add column if not exists confirmed_at timestamptz null;

-- 백필: 이미 사람이 손댄 기록(신규가 아니거나 어드민 수기 등록)은 소급 확정 —
-- 마이그레이션 배포 시점에 기존 데이터가 갑자기 "미확인"으로 밀려나지 않게 한다.
update leads
set confirmed_at = created_at
where confirmed_at is null
  and (status <> 'new' or source = 'admin_manual');

-- 미확인 리드 카운트/필터 조회 경로 최적화.
create index if not exists idx_leads_unconfirmed
  on leads (created_at desc)
  where confirmed_at is null;
