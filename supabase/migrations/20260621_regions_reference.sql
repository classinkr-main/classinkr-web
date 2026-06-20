-- 지역(시도) 표준 + 별칭 + 정규화 함수.
--
-- 목적: customers.region_label / partners.region / leads.branch /
-- branch_rev_deals.region 등에 자유 텍스트로 흩어진 지역값을 17개 시도 표준으로
-- 정규화하기 위한 reference 데이터를 제공한다. unified_companies 뷰가 이 함수를
-- 통해 region_code 를 부착한다.
--
-- 원칙: 기존 테이블은 변경하지 않는다(additive). 정규화 규칙의 단일 진실 원천은
-- lib/regions/korea-regions.ts 이며, region_aliases 는 거기서 생성/동기화한다
-- (scripts/seed-region-aliases.ts). 운영 중 발견되는 추가 이형도 region_aliases 에
-- 행을 더하는 것으로 코드 수정 없이 확장한다.

-- 1) 시도 reference (17개) ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.regions (
  code        TEXT PRIMARY KEY,                       -- 행정표준코드 시도 prefix
  label       TEXT NOT NULL UNIQUE,                   -- 표준 약식 라벨(서울, 부산 ...)
  name        TEXT NOT NULL,                          -- 공식 전체 명칭
  english     TEXT NOT NULL,                          -- 영문 표기
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.regions (code, label, name, english, sort_order) VALUES
  ('11', '서울', '서울특별시',     'Seoul',     1),
  ('26', '부산', '부산광역시',     'Busan',     2),
  ('27', '대구', '대구광역시',     'Daegu',     3),
  ('28', '인천', '인천광역시',     'Incheon',   4),
  ('29', '광주', '광주광역시',     'Gwangju',   5),
  ('30', '대전', '대전광역시',     'Daejeon',   6),
  ('31', '울산', '울산광역시',     'Ulsan',     7),
  ('36', '세종', '세종특별자치시', 'Sejong',    8),
  ('41', '경기', '경기도',         'Gyeonggi',  9),
  ('42', '강원', '강원특별자치도', 'Gangwon',  10),
  ('43', '충북', '충청북도',       'Chungbuk', 11),
  ('44', '충남', '충청남도',       'Chungnam', 12),
  ('45', '전북', '전북특별자치도', 'Jeonbuk',  13),
  ('46', '전남', '전라남도',       'Jeonnam',  14),
  ('47', '경북', '경상북도',       'Gyeongbuk',15),
  ('48', '경남', '경상남도',       'Gyeongnam',16),
  ('50', '제주', '제주특별자치도', 'Jeju',     17)
ON CONFLICT (code) DO UPDATE SET
  label      = EXCLUDED.label,
  name       = EXCLUDED.name,
  english    = EXCLUDED.english,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

DROP TRIGGER IF EXISTS regions_updated_at ON public.regions;
CREATE TRIGGER regions_updated_at
  BEFORE UPDATE ON public.regions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 2) 지역 별칭(자유텍스트 → 시도코드) ---------------------------------------
-- normalized: 매칭 키(소문자 + 모든 공백 제거). scripts/seed-region-aliases.ts 가
-- lib/regions/korea-regions.ts 로부터 시도 이형 + 시군구 약식을 채운다.
CREATE TABLE IF NOT EXISTS public.region_aliases (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias        TEXT NOT NULL,                         -- 원본 표기(표시용)
  normalized   TEXT NOT NULL,                         -- 매칭 키
  region_code  TEXT NOT NULL REFERENCES public.regions(code) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'manual'
                 CHECK (kind IN ('sido', 'sigungu', 'variant', 'manual')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT region_aliases_normalized_unique UNIQUE (normalized)
);

CREATE INDEX IF NOT EXISTS region_aliases_region_code_idx
  ON public.region_aliases (region_code);

-- 3) 정규화 함수: 자유텍스트 → 시도코드 -------------------------------------
-- 1차 정확 매칭(region_aliases.normalized) → 2차 부분일치(가장 앞 시도명).
-- lib/regions/korea-regions.ts 의 normalizeRegionLabel() 과 동일한 의도.
CREATE OR REPLACE FUNCTION public.normalize_region_code(input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  trimmed TEXT := btrim(coalesce(input, ''));
  key     TEXT := lower(regexp_replace(btrim(coalesce(input, '')), '\s+', '', 'g'));
  result  TEXT;
BEGIN
  IF key = '' THEN
    RETURN NULL;
  END IF;

  -- 1) 정확 매칭(별칭 테이블: 시도 이형 + 시군구 약식 + 운영 추가분)
  SELECT ra.region_code INTO result
  FROM public.region_aliases ra
  WHERE ra.normalized = key
  LIMIT 1;
  IF result IS NOT NULL THEN
    RETURN result;
  END IF;

  -- 1.5) 접미사(시/군/구) 제거 후 정확 매칭 — "수원시"→수원, "강남구"→강남
  IF char_length(key) >= 3 AND right(key, 1) IN ('시', '군', '구') THEN
    SELECT ra.region_code INTO result
    FROM public.region_aliases ra
    WHERE ra.normalized = left(key, char_length(key) - 1)
    LIMIT 1;
    IF result IS NOT NULL THEN
      RETURN result;
    END IF;
  END IF;

  -- 2) 부분일치: 입력에 가장 앞서 등장하는 시도(라벨/공식명) 채택
  --    "경기도 광주시" → 경기, "서울 강남구" → 서울
  SELECT r.code INTO result
  FROM public.regions r
  WHERE position(r.label IN trimmed) > 0 OR position(r.name IN trimmed) > 0
  ORDER BY LEAST(
    COALESCE(NULLIF(position(r.label IN trimmed), 0), 2147483647),
    COALESCE(NULLIF(position(r.name  IN trimmed), 0), 2147483647)
  ) ASC
  LIMIT 1;

  RETURN result;
END;
$$;

-- 4) RLS: reference 데이터는 읽기 공개, 쓰기는 관리자만 ----------------------
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.region_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Regions are readable" ON public.regions;
CREATE POLICY "Regions are readable"
  ON public.regions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage regions" ON public.regions;
CREATE POLICY "Admins manage regions"
  ON public.regions FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Region aliases are readable" ON public.region_aliases;
CREATE POLICY "Region aliases are readable"
  ON public.region_aliases FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage region aliases" ON public.region_aliases;
CREATE POLICY "Admins manage region aliases"
  ON public.region_aliases FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());
