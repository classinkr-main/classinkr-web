-- 어드민 계정 ↔ 외부 CRM(NEO) 담당자 id 연결.
--
-- 재연락 알림이 담당자 개인에게 가려면 이 고리가 필요하다. 컬럼은 있었지만 10명 전원 비어 있어
-- 알림이 관리자 전체로만 갈 수 있었다.
--
-- 대응 근거는 추측이 아니다:
--   · crm_xiaoshouyi_owner_names.display_name 이 "[담당자 1] ([담당자 1] 한글)" 처럼 영문·한글을 함께 들고 있고,
--   · 유일하게 이름만으로 갈리지 않던 [담당자 4]은 어드민 이메일([사내 메일])로 [담당자 4] 임이 확인됐다.
--   · [담당자 8] 는 owner_names 표에는 없고 스냅샷에만 '[담당자 8]' 로 있어 그 id 를 쓴다.
--
-- 중국팀([중국팀 직원], 系统管理员)은 한국 어드민 계정이 없어 연결하지 않는다.

UPDATE public.admin_profiles SET neo_owner_id = '3637139967525610', updated_at = now()
  WHERE user_id = 'c5253b43-77f4-40e7-8de6-cfc97dd85e6f' AND neo_owner_id IS DISTINCT FROM '3637139967525610';  -- [담당자 1]

UPDATE public.admin_profiles SET neo_owner_id = '3757503865438940', updated_at = now()
  WHERE user_id = '1f5c92ca-5b81-47f2-bf42-fff114bb8450' AND neo_owner_id IS DISTINCT FROM '3757503865438940';  -- [담당자 2]

UPDATE public.admin_profiles SET neo_owner_id = '4084650935091887', updated_at = now()
  WHERE user_id = 'de5ca6f6-77cf-44d9-927a-1722e5f607ba' AND neo_owner_id IS DISTINCT FROM '4084650935091887';  -- [담당자 3]

UPDATE public.admin_profiles SET neo_owner_id = '3935704427463307', updated_at = now()
  WHERE user_id = '57846c97-c0e0-494f-8240-7ef2b2b59f20' AND neo_owner_id IS DISTINCT FROM '3935704427463307';  -- [담당자 4]

UPDATE public.admin_profiles SET neo_owner_id = '3637154579422025', updated_at = now()
  WHERE user_id = '4ffc2a0b-dd33-40f1-93a7-56c2b3c7357e' AND neo_owner_id IS DISTINCT FROM '3637154579422025';  -- [담당자 5]

UPDATE public.admin_profiles SET neo_owner_id = '3637136716307280', updated_at = now()
  WHERE user_id = '25d9081a-e409-49e7-9406-0b015ebcfeb0' AND neo_owner_id IS DISTINCT FROM '3637136716307280';  -- [담당자 6]

UPDATE public.admin_profiles SET neo_owner_id = '3637139388521310', updated_at = now()
  WHERE user_id = '2b952ba0-866b-4ed0-b45b-14b12d6be3e7' AND neo_owner_id IS DISTINCT FROM '3637139388521310';  -- [담당자 7]

UPDATE public.admin_profiles SET neo_owner_id = '4361660407743248', updated_at = now()
  WHERE user_id = 'e2541fe4-d753-4a16-afaa-f036da54a9cd' AND neo_owner_id IS DISTINCT FROM '4361660407743248';  -- [담당자 8]
