-- 어드민 계정 ↔ 외부 CRM(NEO) 담당자 id 연결.
--
-- 재연락 알림이 담당자 개인에게 가려면 이 고리가 필요하다. 컬럼은 있었지만 10명 전원 비어 있어
-- 알림이 관리자 전체로만 갈 수 있었다.
--
-- 대응 근거는 추측이 아니다:
--   · crm_xiaoshouyi_owner_names.display_name 이 "Somang Jin (진소망)" 처럼 영문·한글을 함께 들고 있고,
--   · 유일하게 이름만으로 갈리지 않던 문준혁은 어드민 이메일(junhyuk.mun@classin.com)로 MOON 임이 확인됐다.
--   · Hwang Chanwoo 는 owner_names 표에는 없고 스냅샷에만 'Hwang Chanwoo-EEO04893' 로 있어 그 id 를 쓴다.
--
-- 중국팀(金正武-EEO03512, 系统管理员)은 한국 어드민 계정이 없어 연결하지 않는다.

UPDATE public.admin_profiles SET neo_owner_id = '3637139967525610', updated_at = now()
  WHERE user_id = 'c5253b43-77f4-40e7-8de6-cfc97dd85e6f' AND neo_owner_id IS DISTINCT FROM '3637139967525610';  -- Somang Jin = 진소망 · somang.jin@

UPDATE public.admin_profiles SET neo_owner_id = '3757503865438940', updated_at = now()
  WHERE user_id = '1f5c92ca-5b81-47f2-bf42-fff114bb8450' AND neo_owner_id IS DISTINCT FROM '3757503865438940';  -- Heesung Shin = 신희성 · heesung.shin@

UPDATE public.admin_profiles SET neo_owner_id = '4084650935091887', updated_at = now()
  WHERE user_id = 'de5ca6f6-77cf-44d9-927a-1722e5f607ba' AND neo_owner_id IS DISTINCT FROM '4084650935091887';  -- Jung Gyusung = 정규성 · gyusung.jung@

UPDATE public.admin_profiles SET neo_owner_id = '3935704427463307', updated_at = now()
  WHERE user_id = '57846c97-c0e0-494f-8240-7ef2b2b59f20' AND neo_owner_id IS DISTINCT FROM '3935704427463307';  -- MOON = 문준혁 · junhyuk.mun@ (표의 'Mun Junhyuk (문준혁)')

UPDATE public.admin_profiles SET neo_owner_id = '3637154579422025', updated_at = now()
  WHERE user_id = '4ffc2a0b-dd33-40f1-93a7-56c2b3c7357e' AND neo_owner_id IS DISTINCT FROM '3637154579422025';  -- Wangchan Lee = 이왕찬 · wangchan.lee@

UPDATE public.admin_profiles SET neo_owner_id = '3637136716307280', updated_at = now()
  WHERE user_id = '25d9081a-e409-49e7-9406-0b015ebcfeb0' AND neo_owner_id IS DISTINCT FROM '3637136716307280';  -- Han Park = 박한 · han.park@

UPDATE public.admin_profiles SET neo_owner_id = '3637139388521310', updated_at = now()
  WHERE user_id = '2b952ba0-866b-4ed0-b45b-14b12d6be3e7' AND neo_owner_id IS DISTINCT FROM '3637139388521310';  -- Minjae Kim = 김민재 · minjae.kim@

UPDATE public.admin_profiles SET neo_owner_id = '4361660407743248', updated_at = now()
  WHERE user_id = 'e2541fe4-d753-4a16-afaa-f036da54a9cd' AND neo_owner_id IS DISTINCT FROM '4361660407743248';  -- Hwang Chanwoo = 황찬우 · chanwoo.hwang@ (스냅샷 'Hwang Chanwoo-EEO04893')
