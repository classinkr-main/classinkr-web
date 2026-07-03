// 고객(거래처) 정규화 키 — REV 원장 고객 그룹핑의 단일 규약(SSOT).
//
// 규칙(순서 고정):
//   1) NFKC 정규화 — 전각/반각·호환 문자를 통일
//   2) 소문자화
//   3) 공백·구분 기호 일괄 제거: /[\s()[\]{}._\-|/]+/g
//
// 이 키는 ①REV DB 임포트의 source_record_key(`sheet:{row}:{key}`) ②주간 마감 스냅샷
// diff ③매출 워크벤치 고객 그룹핑이 전부 같은 값을 써야 하며, 향후 하드웨어 출고 ↔ REV
// 매출 대사(reconciliation)의 조인 키가 된다. SQL 쌍둥이(뷰/트리거용 immutable 함수)를
// 만들 때도 아래 규칙과 바이트 단위로 동일해야 한다:
//   lower(regexp_replace(normalize(value, NFKC), '[\s()\[\]{}._\-|/]+', '', 'g'))
// 규칙을 바꾸면 이미 저장된 source_record_key와 어긋나므로 마이그레이션 없이는 수정 금지.
//
// 서버/클라이언트 공용 순수 함수 — "server-only"를 넣지 말 것(워크벤치가 클라이언트에서 씀).
export function normalizedAccountKey(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s()[\]{}._\-|/]+/g, "")
}
