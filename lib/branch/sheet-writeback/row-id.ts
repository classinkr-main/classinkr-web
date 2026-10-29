// '2. REV' 숨김 "Row ID" 열의 행 식별자 — 순수 모듈(클라이언트 겸용).
//
// 형식: "r_" + Crockford base32 소문자 12자(60비트). i·l·o·u 는 쓰지 않는다(0·1 과 헷갈림).
// 시트 정렬·행 삽입으로 행 번호가 바뀌어도 이 값으로 같은 행을 다시 찾는다.

export const ROW_ID_RE = /^r_[0-9a-hjkmnp-tv-z]{12}$/

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"
const ROW_ID_BODY_LENGTH = 12
const MAX_ATTEMPTS = 64

export function isValidRowId(v: unknown): v is string {
  return typeof v === "string" && ROW_ID_RE.test(v)
}

function defaultRand(n: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(n))
}

/** 기존 ID 와 겹치지 않는 새 행 ID. 256 은 32 의 배수라 `& 31` 은 치우침이 없다. */
export function generateRowId(existing: ReadonlySet<string>, rand: (n: number) => Uint8Array = defaultRand): string {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const bytes = rand(ROW_ID_BODY_LENGTH)
    if (bytes.length < ROW_ID_BODY_LENGTH) throw new Error("generateRowId: 난수 바이트가 모자랍니다")
    let body = ""
    for (let index = 0; index < ROW_ID_BODY_LENGTH; index += 1) body += ALPHABET[bytes[index] & 31]
    const id = `r_${body}`
    if (!existing.has(id)) return id
  }
  throw new Error("generateRowId: 겹치지 않는 ID 를 만들지 못했습니다")
}
