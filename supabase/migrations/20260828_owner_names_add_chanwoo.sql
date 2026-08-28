-- 황찬우를 XiaoshouYi 담당자 이름 정본에 등재한다.
--
-- 20260611 시드 시점에는 CRM User 목록에 없었던 신규 담당자. 스냅샷에는
-- 'Hwang Chanwoo-EEO04893' 명의 계정 5곳이 이미 있고, CRM User 실물 확인
-- (id=4361660407743248, name='Hwang Chanwoo-EEO04893')과 어드민 이메일
-- (chanwoo.hwang@classin.com) 대응까지 검증됐다. admin_profiles.neo_owner_id
-- 는 20260828_admin_neo_owner_link 에서 이미 이 id 로 연결돼 있다 —
-- 이 행이 빠져 있으면 이름 해석(resolveOwnerName)과 명의 지정 도구가
-- 황찬우만 하드코딩 예외로 다루게 된다.

INSERT INTO public.crm_xiaoshouyi_owner_names (external_id, display_name, korean_name, eeo_code, team, is_excluded, metadata)
VALUES
  ('4361660407743248', 'Hwang Chanwoo (황찬우)', '황찬우', 'EEO04893', 'KR', false, '{"verified":"crm_user_lookup_2026-08-28"}'::jsonb)
ON CONFLICT (external_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  korean_name = EXCLUDED.korean_name,
  eeo_code = EXCLUDED.eeo_code,
  team = EXCLUDED.team,
  is_excluded = EXCLUDED.is_excluded,
  updated_at = now();
