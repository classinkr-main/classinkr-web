// 위컴(企业微信) 지능형 로봇(智能机器人) API 모드 — 콜백 서명·암복호화. 순수 함수(입출력·환경변수 없음).
//
// 규격 출처(공식 문서, 2026-11-25 확인 — docs/active/wecom-aibot-bridge.md 에 문장과 함께 적어 둠):
//  - 加解密方案说明 https://developer.work.weixin.qq.com/document/path/91144
//      dev_msg_signature = sha1(sort(token、timestamp、nonce、msg_encrypt)) — 네 값을 사전순으로 이어 붙인 sha1(소문자 16진).
//      EncodingAESKey 는 43자, AESKey = Base64_Decode(EncodingAESKey + "=") (32바이트, AES-256).
//      AES-CBC, PKCS#7 로 32바이트 배수까지 채움, IV = AESKey 앞 16바이트.
//      rand_msg = random(16B) + msg_len(4B, 네트워크 바이트 순서) + msg + receiveid.
//  - 回调和回复的加解密方案(지능형 로봇) https://developer.work.weixin.qq.com/document/path/101033
//      콜백 본문은 JSON {"encrypt": "..."}, 수동 답은 {"encrypt","msgsignature","timestamp","nonce"}(nonce 는 콜백 URL 의 것).
//      "企业内部智能机器人场景中，ReceiveId为\"\"" — 내부 로봇은 receiveid 가 빈 문자열.
// 시험은 91144 의 예제 값(token QDG6eK 등)으로 서명·복호화를 그대로 맞춘다(tests/api/wecom-aibot-crypto.test.ts).
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "crypto"

const BLOCK = 32

export class WecomCryptoError extends Error {
  constructor(public readonly code: "bad_key" | "bad_base64" | "bad_padding" | "bad_length" | "bad_receiveid" | "decrypt_failed") {
    super(`wecom_crypto:${code}`)
    this.name = "WecomCryptoError"
  }
}

/** EncodingAESKey(43자) → 32바이트 키. 모양이 다르면 던진다. */
export function decodeAesKey(encodingAesKey: string): Buffer {
  const trimmed = encodingAesKey.trim()
  if (!/^[A-Za-z0-9]{43}$/.test(trimmed)) throw new WecomCryptoError("bad_key")
  const key = Buffer.from(`${trimmed}=`, "base64")
  if (key.length !== 32) throw new WecomCryptoError("bad_key")
  return key
}

/** sha1(사전순으로 정렬해 이어 붙인 token·timestamp·nonce·encrypt), 소문자 16진. */
export function computeSignature(token: string, timestamp: string, nonce: string, encrypt: string): string {
  return createHash("sha1").update([token, timestamp, nonce, encrypt].sort().join("")).digest("hex")
}

/** 서명 비교 — 길이·내용 모두 시간 일정 비교(길이가 다르면 같은 길이 해시끼리 비교해 시간을 맞춘다). */
export function verifySignature(input: { token: string; timestamp: string; nonce: string; encrypt: string; signature: string }): boolean {
  const expected = Buffer.from(computeSignature(input.token, input.timestamp, input.nonce, input.encrypt), "utf8")
  const given = Buffer.from(input.signature.trim().toLowerCase(), "utf8")
  if (given.length !== expected.length) {
    timingSafeEqual(expected, expected)
    return false
  }
  return timingSafeEqual(expected, given)
}

function pkcs7Pad(data: Buffer): Buffer {
  const pad = BLOCK - (data.length % BLOCK)
  return Buffer.concat([data, Buffer.alloc(pad, pad)])
}

function pkcs7Unpad(data: Buffer): Buffer {
  if (data.length === 0 || data.length % 16 !== 0) throw new WecomCryptoError("bad_padding")
  const pad = data[data.length - 1]
  if (pad < 1 || pad > BLOCK || pad > data.length) throw new WecomCryptoError("bad_padding")
  for (let i = data.length - pad; i < data.length; i += 1) if (data[i] !== pad) throw new WecomCryptoError("bad_padding")
  return data.subarray(0, data.length - pad)
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

/**
 * 복호화 — 평문 msg 를 돌려준다. receiveid 가 기대값과 다르면 던진다(내부 로봇은 빈 문자열, 101033).
 * 키 길이·base64·패딩·길이 칸이 하나라도 어긋나면 던진다(무엇이 어긋났는지만, 값은 싣지 않는다).
 */
export function decryptMessage(encrypt: string, key: Buffer, expectedReceiveId = ""): string {
  if (key.length !== 32) throw new WecomCryptoError("bad_key")
  const compact = encrypt.trim()
  if (!compact || !BASE64.test(compact)) throw new WecomCryptoError("bad_base64")
  const cipherText = Buffer.from(compact, "base64")
  if (cipherText.length === 0 || cipherText.length % 16 !== 0) throw new WecomCryptoError("bad_length")
  let plain: Buffer
  try {
    const decipher = createDecipheriv("aes-256-cbc", key, key.subarray(0, 16))
    decipher.setAutoPadding(false)
    plain = Buffer.concat([decipher.update(cipherText), decipher.final()])
  } catch {
    throw new WecomCryptoError("decrypt_failed")
  }
  const content = pkcs7Unpad(plain)
  if (content.length < 20) throw new WecomCryptoError("bad_length")
  const msgLen = content.readUInt32BE(16)
  if (20 + msgLen > content.length) throw new WecomCryptoError("bad_length")
  const msg = content.subarray(20, 20 + msgLen)
  const receiveId = content.subarray(20 + msgLen).toString("utf8")
  if (receiveId !== expectedReceiveId) throw new WecomCryptoError("bad_receiveid")
  return msg.toString("utf8")
}

/** 암호화 — random(16) + len(4, BE) + msg + receiveid 를 PKCS#7(32) 으로 채워 AES-256-CBC, base64. */
export function encryptMessage(msg: string, key: Buffer, receiveId = "", random: Buffer = randomBytes(16)): string {
  if (key.length !== 32) throw new WecomCryptoError("bad_key")
  if (random.length !== 16) throw new WecomCryptoError("bad_length")
  const body = Buffer.from(msg, "utf8")
  const len = Buffer.alloc(4)
  len.writeUInt32BE(body.length, 0)
  const plain = pkcs7Pad(Buffer.concat([random, len, body, Buffer.from(receiveId, "utf8")]))
  const cipher = createCipheriv("aes-256-cbc", key, key.subarray(0, 16))
  cipher.setAutoPadding(false)
  return Buffer.concat([cipher.update(plain), cipher.final()]).toString("base64")
}

/** 수동 답 봉투(101033) — {"encrypt","msgsignature","timestamp","nonce"}. nonce 는 콜백 URL 의 것을 쓴다. */
export function buildEncryptedReply(input: { plaintext: string; token: string; key: Buffer; nonce: string; timestamp: number; random?: Buffer }) {
  const encrypt = encryptMessage(input.plaintext, input.key, "", input.random)
  const timestamp = String(Math.floor(input.timestamp))
  return { encrypt, msgsignature: computeSignature(input.token, timestamp, input.nonce, encrypt), timestamp: Number(timestamp), nonce: input.nonce }
}

/** 시각 창 — timestamp(초)가 지금(ms)에서 ±windowSeconds 안인지. 숫자가 아니면 false. */
export function withinTimestampWindow(timestamp: string, nowMs: number, windowSeconds = 300): boolean {
  if (!/^\d{1,12}$/.test(timestamp.trim())) return false
  return Math.abs(Number(timestamp) - Math.floor(nowMs / 1000)) <= windowSeconds
}
