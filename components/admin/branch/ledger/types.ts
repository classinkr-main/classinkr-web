// SalesLedgerWorkbench 하위 프레젠테이션 컴포넌트가 공유하는 프롭 타입.
// BranchJsonState는 client-api.ts에서 export되지 않아(내부 타입) 여기서 구조적으로 동일하게
// 재선언한다 — TypeScript 구조적 타이핑 덕분에 부모의 useBranchJson 반환값을 그대로 받는다.
export interface BranchJsonState<T> {
  key: string
  data: T | null
  error: string | null
  loading: boolean
}
