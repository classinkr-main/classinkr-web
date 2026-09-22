-- 매출 장부 "적용된 값을 한 번에 바꾸기"(P2-9) — 옛 entry 반전 + 새 checked 초안 적용을
-- 한 트랜잭션(=이 함수 호출 1번)으로 묶는 원자 대체 RPC.
--
-- 배경(설계 조사 결과 요약): 이미 장부에 적용된 값(적용된 new-row 초안, 적용된 edit-row
-- 정정)을 다시 바꾸려면 지금은 "되돌리기(reverse) 1요청 → 새 초안 생성·체크·적용 2~3요청"
-- 으로 큐를 두 번 방문해야 한다. 더 큰 문제는 원자성이다: reverse는 트리거로 강제된
-- 단방향(active→reversed만, 되돌릴 수 없음)이고 두 동작이 별개 HTTP 요청이라, 반전이
-- 성공한 뒤 재적용 쪽이 실패하면 장부가 조용히 원본 값으로 돌아간다(화면 어디에도 진행중
-- 표시가 없다). 역순(새 정정을 먼저 적용)은 활성 정정 유일성 인덱스
-- branch_sales_ledger_entries_active_manual_edit_unique(20260717_branch_sales_ledger_entry_
-- reversal.sql)가 23505로 막아, 클라이언트가 쓸 수 있는 유일한 순서가 "먼저 반전"이 되고
-- 바로 그 순서가 위 실패 창을 만든다.
--
-- 이 함수는 "옛 entry 반전 + 새 checked 초안 적용"을 하나의 PL/pgSQL 함수(=하나의 트랜잭션)
-- 안에서 순서대로 실행해 그 실패 창을 없앤다. 기존 apply_branch_sales_ledger_draft/
-- reverse_branch_sales_ledger_entry는 그대로 호출만 하고 본문을 복제하지 않는다 — 두 함수가
-- 갖는 트리거 허용 컬럼 목록·CHECK 제약과의 상호작용을 한 곳에서만 유지해, 기존 모든
-- 적용/반전 경로(모든 단건·배치 흐름)의 회귀 반경을 이 파일 밖으로 유지한다.
--
-- 적용 순서: 이 파일을 프로덕션 Supabase에 먼저 적용 → npm run check:db로 확인 → 코드 배포.
-- 순서가 뒤집혀 코드가 먼저 나가도 안전하다 — 저장소(lib/repositories/
-- branch-sales-ledger-drafts.ts)가 RPC 부재를 감지하면 "적용값 한 번에 바꾸기" 기능만 UI에
-- 노출하지 않고(fail-closed), 기존 되돌리기 → 재적용 수동 경로는 그대로 동작해 화면이 깨지지
-- 않는다.
--
-- 롤백: DROP FUNCTION public.supersede_branch_sales_ledger_entry(UUID, UUID, TEXT, TEXT);
-- 신규 함수 1개만 추가하는 파일이라 기존 테이블·데이터에는 영향이 없다.

CREATE OR REPLACE FUNCTION public.supersede_branch_sales_ledger_entry(
  p_old_draft_id UUID,
  p_new_draft_id UUID,
  p_actor TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.branch_sales_ledger_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.branch_sales_ledger_entries%ROWTYPE;
  v_new public.branch_sales_ledger_drafts%ROWTYPE;
BEGIN
  -- 0) 가용성 프로브 경로: 두 id가 모두 NULL이면 아무것도 잠그거나 쓰지 않고 NULL을 돌려준다.
  -- 앱(lib/repositories/branch-sales-ledger-drafts.ts의 probeSupersedeAvailable)이 이 함수가 운영
  -- DB에 있는지 확인할 때만 쓴다. 존재하지 않는 id로 부르는 방식은 매번 P0002를 DB ERROR 로그로
  -- 남겨(서버 인스턴스마다 60초에 한 번) 장애 대응 중 실제 실패로 오인될 수 있어 에러 없는 경로를 둔다.
  -- 한쪽만 NULL이면 프로브가 아니다 — 아래 1)·2)에서 0행으로 P0002가 난다.
  IF p_old_draft_id IS NULL AND p_new_draft_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1) 옛 entry를 draft_id로 잠근다 — 없으면(적용된 적 없는 초안 등) 대체할 대상 자체가 없다.
  SELECT * INTO v_old
    FROM public.branch_sales_ledger_entries
   WHERE draft_id = p_old_draft_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'supersede: old draft has no applied entry (old_draft_id=%)', p_old_draft_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 2) 새 초안을 id로 잠근다. 잠금 순서를 항상 "옛 entry → 새 draft"로 고정해 두면 이 함수가
  -- 두 테이블을 함께 잠그는 유일한 경로이므로 다른 트랜잭션과 교착할 여지가 없다.
  SELECT * INTO v_new
    FROM public.branch_sales_ledger_drafts
   WHERE id = p_new_draft_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'supersede: new draft not found (new_draft_id=%)', p_new_draft_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 3) 대상 일치 검증 — 엉뚱한 entry를 대체하지 못하게 막는다. kind ↔ entry_type이 대응하고
  -- (edit-row↔manual-edit, new-row↔manual-new), 같은 귀속월이며, 유형별 식별자까지 같아야
  -- "진짜 같은 대상"이다: edit-row/manual-edit는 source_deal_id로 판별하고, new-row/manual-new는
  -- source_deal_id가 비어 있을 수 있어(추가분은 딜 연결이 없을 수 있음) 대신 고객명(trim)으로
  -- 판별한다. 넷 중 하나라도 어긋나면 즉시 거부한다.
  IF (v_old.entry_type = 'manual-edit' AND v_new.kind <> 'edit-row')
     OR (v_old.entry_type = 'manual-new' AND v_new.kind <> 'new-row') THEN
    RAISE EXCEPTION 'supersede: target mismatch (kind % does not correspond to entry_type %)',
      v_new.kind, v_old.entry_type
      USING ERRCODE = 'P0001';
  END IF;

  IF v_old.ledger_month IS DISTINCT FROM v_new.ledger_month THEN
    RAISE EXCEPTION 'supersede: target mismatch (ledger_month % <> %)',
      v_old.ledger_month, v_new.ledger_month
      USING ERRCODE = 'P0001';
  END IF;

  IF v_old.entry_type = 'manual-edit'
     AND v_old.source_deal_id IS DISTINCT FROM v_new.source_deal_id THEN
    RAISE EXCEPTION 'supersede: target mismatch (source_deal_id % <> %)',
      v_old.source_deal_id, v_new.source_deal_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_old.entry_type = 'manual-new'
     AND btrim(coalesce(v_old.customer_name, '')) <> btrim(coalesce(v_new.customer_name, '')) THEN
    RAISE EXCEPTION 'supersede: target mismatch (customer_name % <> %)',
      v_old.customer_name, v_new.customer_name
      USING ERRCODE = 'P0001';
  END IF;

  -- 4) 멱등: 이 함수가 과거 호출에서 이미 성공적으로 끝냈다면(옛 entry reversed + 새 초안
  -- applied) 클라가 네트워크 실패 등으로 같은 (old,new) 쌍을 재시도해도 같은 결과를 그대로
  -- 반환한다 — 재시도 안전. 대상 일치 검증(3) **뒤에** 둔다: 적용된 초안과 entry는 트리거로
  -- 불변이라 진짜 재시도는 3을 항상 다시 통과하고, 서로 무관한 (반전된 entry, 적용된 초안) 쌍으로
  -- 부른 잘못된 호출만 "성공"으로 둔갑하지 않고 걸러진다.
  IF v_old.entry_status = 'reversed' AND v_new.status = 'applied' THEN
    RETURN v_new;
  END IF;

  -- 5) 새 초안은 반드시 checked 상태여야 한다(매트릭스 자가 체크와 동일한 2단 게이트 —
  -- 체크되지 않은 값을 그대로 장부에 꽂지 않는다). 위 4번 멱등 분기를 이미 지나쳤으므로
  -- 여기 도달했다면 진짜 미체크 상태다.
  IF v_new.status <> 'checked' THEN
    RAISE EXCEPTION 'supersede: new draft must be checked (new_draft_id=%, status=%)',
      p_new_draft_id, v_new.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 6) 옛 entry가 아직 active면 기존 반전 RPC를 그대로 호출해 상쇄한다 — entries UPDATE를
  -- 허용하는 컬럼 목록(prevent_branch_sales_ledger_entry_update 트리거, 20260717/20260702
  -- 참고)을 이 함수가 복제하지 않고 한 곳(reverse_branch_sales_ledger_entry)에서만 유지하기
  -- 위해서다. 이미 reversed라면(예: 다른 경로로 먼저 반전된 뒤 이 함수가 나중에 호출된 경우)
  -- 호출 자체를 건너뛴다 — reverse도 멱등이라 다시 불러도 안전하지만, 굳이 불러 최초 반전
  -- 사유·시각을 덮어쓸 이유가 없다.
  IF v_old.entry_status = 'active' THEN
    PERFORM public.reverse_branch_sales_ledger_entry(
      v_old.id,
      p_actor,
      coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'superseded by draft ' || p_new_draft_id::text)
    );
  END IF;

  -- 7) 새 초안을 적용한다. 같은 트랜잭션 안에서 6번이 이미 반영됐으므로(트랜잭션 내부에서는
  -- 자기 자신의 변경이 바로 보인다) 옛 entry는 이 시점에 이미 reversed다. 따라서
  -- apply_branch_sales_ledger_draft의 INSERT가 새로 만드는 active entry는 활성 정정 유일성
  -- 인덱스(branch_sales_ledger_entries_active_manual_edit_unique, 20260717)와 절대 충돌하지
  -- 않는다 — 신구 entry가 동시에 active로 보이는 순간이 트랜잭션 안에 아예 존재하지 않는다.
  v_new := public.apply_branch_sales_ledger_draft(p_new_draft_id, p_actor);

  -- apply_branch_sales_ledger_draft가 NULL을 반환하는 유일한 경우는 대상이 checked가 아닌
  -- 것뿐이고 4번에서 이미 확인했지만, 방어적으로 다시 검사한다. 이 RAISE가 이 함수 전체의
  -- 원자성을 지키는 핵심이다: plpgsql 함수 실행 중 발생한 예외는 이 함수 호출을 통째로 하나의
  -- 트랜잭션으로 롤백시키므로, 6번에서 (이 트랜잭션 안에서는) 이미 반영된 것처럼 보였던 반전
  -- 까지 전부 함께 취소된다 — "옛 값은 반전됐는데 새 값은 안 붙은" 상태가 이 함수를 통해서는
  -- 절대 DB 밖으로 나갈 수 없다.
  IF v_new IS NULL THEN
    RAISE EXCEPTION 'supersede: apply returned null (new_draft_id=%)', p_new_draft_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 8) 새로 적용된 초안(entries INSERT까지 끝난 뒤의 최신 draft 행)을 반환한다.
  RETURN v_new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.supersede_branch_sales_ledger_entry(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supersede_branch_sales_ledger_entry(UUID, UUID, TEXT, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.supersede_branch_sales_ledger_entry(UUID, UUID, TEXT, TEXT) IS
  '적용된 매출 장부 값을 새 checked 초안으로 한 번에 대체한다(옛 entry 반전 + 새 초안 적용을 한 트랜잭션으로) — reverse_branch_sales_ledger_entry/apply_branch_sales_ledger_draft를 그대로 호출만 하고 본문은 복제하지 않는다. 멱등.';
