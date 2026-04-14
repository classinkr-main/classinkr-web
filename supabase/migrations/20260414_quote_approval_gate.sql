-- 견적서 승인 게이트: 어드민 생성 → 파트너 승인 후 전송 가능
-- pending_approval 상태 추가 + 승인 추적 컬럼

-- 1. quote_documents에 승인 관련 컬럼 추가
ALTER TABLE quote_documents
  ADD COLUMN IF NOT EXISTS created_by_role TEXT DEFAULT 'partner',
  ADD COLUMN IF NOT EXISTS approved_by     UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at     TIMESTAMPTZ;

-- 2. 기존 행은 파트너 생성으로 간주
UPDATE quote_documents SET created_by_role = 'partner' WHERE created_by_role IS NULL;

-- 3. CHECK 제약: created_by_role은 'admin' | 'partner'만 허용
ALTER TABLE quote_documents
  ADD CONSTRAINT chk_created_by_role CHECK (created_by_role IN ('admin', 'partner'));

-- 4. status 컬럼에 pending_approval 허용
-- (status가 text인 경우 별도 제약 불필요, enum인 경우 값 추가)
-- 현재 text 기반이므로 애플리케이션 레벨에서 검증
