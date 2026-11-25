import { createCipheriv } from "crypto"
import { describe, expect, it } from "vitest"

import {
  buildEncryptedReply,
  computeSignature,
  decodeAesKey,
  decryptMessage,
  encryptMessage,
  verifySignature,
  WecomCryptoError,
  withinTimestampWindow,
} from "@/lib/wecom/aibot-crypto"

// 공식 문서 加解密方案说明(https://developer.work.weixin.qq.com/document/path/91144)의 예제 값 그대로.
// 이 예제는 자체 앱 콜백이라 receiveid 가 corpid 다(지능형 로봇은 빈 문자열, 101033).
const OFFICIAL = {
  corpId: "wx5823bf96d3bd56c7",
  token: "QDG6eK",
  encodingAesKey: "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C",
  signature: "477715d11cdb4164915debcba66cb864d751f3e6",
  timestamp: "1409659813",
  nonce: "1372623149",
  encrypt:
    "RypEvHKD8QQKFhvQ6QleEB4J58tiPdvo+rtK1I9qca6aM/wvqnLSV5zEPeusUiX5L5X/0lWfrf0QADHHhGd3QczcdCUpj911L3vg3W/sYYvuJTs3TUUkSUXxaccAS0qhxchrRYt66wiSpGLYL42aM6A8dTT+6k4aSknmPj48kzJs8qLjvd4Xgpue06DOdnLxAUHzM6+kDZ+HMZfJYuR+LtwGc2hgf5gsijff0ekUNXZiqATP7PF5mZxZ3Izoun1s4zG4LUMnvw2r+KqCKIw+3IQH03v+BCA9nMELNqbSf6tiWSrXJB3LAVGUcallcrw8V2t9EL4EhzJWrQUax5wLVMNS0+rUPA3k22Ncx4XXZS9o0MBH27Bo6BpNelZpS+/uh9KsNlY6bHCmJU9p8g7m3fVKn28H3KDYA5Pl/T8Z1ptDAVe0lXdQ2YoyyH2uyPIGHBZZIs2pDBS8R07+qN+E7Q==",
}

const KEY = decodeAesKey(OFFICIAL.encodingAesKey)

function codeOf(fn: () => unknown): string | null {
  try {
    fn()
    return null
  } catch (error) {
    return error instanceof WecomCryptoError ? error.code : "other"
  }
}

describe("위컴 콜백 암복호화 — 공식 예제 값", () => {
  it("서명은 sha1(사전순 token·timestamp·nonce·encrypt) — 문서의 값과 같다", () => {
    expect(computeSignature(OFFICIAL.token, OFFICIAL.timestamp, OFFICIAL.nonce, OFFICIAL.encrypt)).toBe(OFFICIAL.signature)
    expect(verifySignature({ ...OFFICIAL, signature: OFFICIAL.signature })).toBe(true)
    expect(verifySignature({ ...OFFICIAL, signature: OFFICIAL.signature.toUpperCase() })).toBe(true)
  })

  it("복호화하면 문서의 평문 XML 과 receiveid(corpid)가 나온다", () => {
    const msg = decryptMessage(OFFICIAL.encrypt, KEY, OFFICIAL.corpId)
    expect(msg).toContain("<Content><![CDATA[hello]]></Content>")
    expect(msg).toContain("<MsgId>4561255354251345929</MsgId>")
  })

  it("receiveid 가 다르면 거절한다(로봇 모드의 빈 문자열로 이 예제를 풀면 실패)", () => {
    expect(codeOf(() => decryptMessage(OFFICIAL.encrypt, KEY, ""))).toBe("bad_receiveid")
  })
})

describe("위컴 콜백 암복호화 — 왕복·변조", () => {
  it("암호화 → 복호화 왕복(로봇 모드 receiveid 빈 문자열, 한글 UTF-8)", () => {
    const text = JSON.stringify({ msgid: "m-1", text: { content: "@갈매봇 수업 녹화는 어떻게 해?" } })
    const enc = encryptMessage(text, KEY)
    expect(decryptMessage(enc, KEY, "")).toBe(text)
  })

  it("패딩은 32바이트 배수 — 평문 길이가 블록 경계여도 한 블록을 더 채운다", () => {
    // random16 + len4 + msg12 = 32 → 패딩 32바이트 → 64바이트
    const enc = encryptMessage("abcdefghijkl", KEY, "", Buffer.alloc(16, 1))
    expect(Buffer.from(enc, "base64").length).toBe(64)
    expect(decryptMessage(enc, KEY, "")).toBe("abcdefghijkl")
  })

  it("서명 위조·한 글자 변조는 서명 검사에서 거절된다", () => {
    const enc = encryptMessage("hello", KEY)
    const sig = computeSignature("tok", "1700000000", "n1", enc)
    expect(verifySignature({ token: "tok", timestamp: "1700000000", nonce: "n1", encrypt: enc, signature: sig })).toBe(true)
    expect(verifySignature({ token: "tok", timestamp: "1700000001", nonce: "n1", encrypt: enc, signature: sig })).toBe(false)
    expect(verifySignature({ token: "other", timestamp: "1700000000", nonce: "n1", encrypt: enc, signature: sig })).toBe(false)
    expect(verifySignature({ token: "tok", timestamp: "1700000000", nonce: "n1", encrypt: enc, signature: "abc" })).toBe(false)
  })

  it("암호문 변조는 패딩·길이·receiveid 중 하나로 거절된다(평문을 돌려주지 않는다)", () => {
    const enc = Buffer.from(encryptMessage("hello world", KEY), "base64")
    enc[enc.length - 1] ^= 0xff
    expect(codeOf(() => decryptMessage(enc.toString("base64"), KEY, ""))).not.toBeNull()
  })

  it("잘못된 패딩(마지막 바이트 0)은 bad_padding", () => {
    const plain = Buffer.alloc(32, 0)
    const cipher = createCipheriv("aes-256-cbc", KEY, KEY.subarray(0, 16))
    cipher.setAutoPadding(false)
    const enc = Buffer.concat([cipher.update(plain), cipher.final()]).toString("base64")
    expect(codeOf(() => decryptMessage(enc, KEY, ""))).toBe("bad_padding")
  })

  it("길이 칸이 평문보다 길면 bad_length, base64 가 아니면 bad_base64, 키가 43자가 아니면 bad_key", () => {
    const random = Buffer.alloc(16, 2)
    const len = Buffer.alloc(4)
    len.writeUInt32BE(9999, 0)
    const body = Buffer.concat([random, len, Buffer.from("hi")])
    const pad = 32 - (body.length % 32)
    const cipher = createCipheriv("aes-256-cbc", KEY, KEY.subarray(0, 16))
    cipher.setAutoPadding(false)
    const enc = Buffer.concat([cipher.update(Buffer.concat([body, Buffer.alloc(pad, pad)])), cipher.final()]).toString("base64")
    expect(codeOf(() => decryptMessage(enc, KEY, ""))).toBe("bad_length")
    expect(codeOf(() => decryptMessage("!!not base64!!", KEY, ""))).toBe("bad_base64")
    expect(codeOf(() => decodeAesKey("short"))).toBe("bad_key")
  })

  it("다른 receiveid 로 만든 암호문은 거절한다", () => {
    const enc = encryptMessage("hello", KEY, "corp-other")
    expect(codeOf(() => decryptMessage(enc, KEY, ""))).toBe("bad_receiveid")
  })

  it("수동 답 봉투는 encrypt·msgsignature·timestamp·nonce 를 갖고, 서명이 맞으며 풀면 원문이다", () => {
    const reply = buildEncryptedReply({ plaintext: '{"msgtype":"stream"}', token: "tok", key: KEY, nonce: "n-9", timestamp: 1_700_000_000.7 })
    expect(Object.keys(reply).sort()).toEqual(["encrypt", "msgsignature", "nonce", "timestamp"])
    expect(reply.timestamp).toBe(1_700_000_000)
    expect(reply.nonce).toBe("n-9")
    expect(reply.msgsignature).toBe(computeSignature("tok", "1700000000", "n-9", reply.encrypt))
    expect(decryptMessage(reply.encrypt, KEY, "")).toBe('{"msgtype":"stream"}')
  })

  it("시각 창 ±5분 — 밖이거나 숫자가 아니면 false", () => {
    const now = 1_700_000_000_000
    expect(withinTimestampWindow("1700000000", now)).toBe(true)
    expect(withinTimestampWindow("1700000300", now)).toBe(true)
    expect(withinTimestampWindow("1699999699", now)).toBe(false)
    expect(withinTimestampWindow("1700000301", now)).toBe(false)
    expect(withinTimestampWindow("abc", now)).toBe(false)
  })
})
