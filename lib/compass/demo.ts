/** 회차 원장은 취소·노쇼·미팅도 보존한다. 데모 건수·업무 신호는 유효 회차만 사용한다. */
export function isCountableCompassDemo(row: { kind: string | null; status: string | null }): boolean {
  return row.kind === "demo" && (row.status === "booked" || row.status === "done")
}
