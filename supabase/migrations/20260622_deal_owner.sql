-- Per-rep deal ownership.
-- 영업담당자(소유자) 귀속을 위한 deals.owner_id. 기존 딜은 생성자로 1회 백필한다.
-- created_by(=생성자)와 owner_id(=현재 담당자)를 분리해 재배정이 가능하도록 둔다.

alter table public.deals
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

create index if not exists deals_owner_id_idx
  on public.deals (owner_id, updated_at desc)
  where owner_id is not null;

-- 백필: 소유자 미지정 딜은 최초 생성자를 담당자로 본다.
update public.deals
  set owner_id = created_by
  where owner_id is null and created_by is not null;

comment on column public.deals.owner_id is '영업담당자(소유자) auth.users id. 리드→딜 귀속 및 per-rep 파이프라인/리더보드 기준. created_by(생성자)와 분리.';

notify pgrst, 'reload schema';
