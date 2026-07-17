-- 내부 전용 카테고리 문서의 visibility/noindex 고정 트리거 (P1).
--
-- 목적: internal-canon(브랜드 캐논 seed)과 cs-knowledge(검토 승인 CS 답변 승격) 카테고리의
--   문서는 어떤 쓰기 경로(seed 스크립트, 승격 라우트, 어드민 문서 편집 API)로도
--   visibility='internal' AND noindex=true 를 벗어날 수 없게 DB 에서 강제한다.
--   내부 상담 맥락이 섞인 문서가 실수로 공개(visibility 변경)되는 사고를 스키마 수준에서 차단한다.
--
-- 방식: 조용한 강제(값 덮어쓰기)가 아니라 RAISE EXCEPTION — 관리자가 의도(내부 전용)를 알 수 있게
--   명시 에러를 낸다. 어드민 문서 API(app/api/admin/docs/articles)는 error.message 를 그대로
--   응답에 노출하므로 이 메시지가 화면에서 읽힌다.

CREATE OR REPLACE FUNCTION public.enforce_internal_only_docs_articles()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $trg$
BEGIN
  IF NEW.category_id IN ('internal-canon', 'cs-knowledge') THEN
    IF NEW.visibility IS DISTINCT FROM 'internal' OR NEW.noindex IS DISTINCT FROM true THEN
      RAISE EXCEPTION
        '카테고리 "%"는 내부 전용입니다. visibility=internal, noindex=true 만 허용됩니다 (요청값: visibility=%, noindex=%).',
        NEW.category_id, NEW.visibility, NEW.noindex
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$trg$;

COMMENT ON FUNCTION public.enforce_internal_only_docs_articles() IS
  'internal-canon/cs-knowledge 카테고리 문서를 visibility=internal + noindex=true 로 고정. 위반 시 명시 에러(check_violation).';

DROP TRIGGER IF EXISTS docs_articles_internal_only_lock ON public.docs_articles;
CREATE TRIGGER docs_articles_internal_only_lock
  BEFORE INSERT OR UPDATE ON public.docs_articles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_internal_only_docs_articles();
