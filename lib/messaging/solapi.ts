import "server-only"

import { SolapiMessageService } from "solapi"

/**
 * ─────────────────────────────────────────────────────────────
 * messaging/solapi.ts  —  solapi 클라이언트 (lib/resend.ts 패턴)
 * ─────────────────────────────────────────────────────────────
 *
 * env(SOLAPI_API / SOLAPI_SECRET) 미설정이면 null 클라이언트를 반환한다.
 * 실제 미설정 경고/시뮬레이션 처리는 발송 시점(lib/messaging/send.ts)에서 담당.
 */

const apiKey = process.env.SOLAPI_API
const apiSecret = process.env.SOLAPI_SECRET

/**
 * solapi 메시지 서비스 싱글턴.
 * 자격증명 미설정 시 null — 호출부는 이때 dry-run(simulated)으로 폴백해야 한다.
 */
export const solapi: SolapiMessageService | null =
  apiKey && apiSecret ? new SolapiMessageService(apiKey, apiSecret) : null

/** solapi 자격증명 설정 여부. */
export function isSolapiConfigured(): boolean {
  return solapi !== null
}

/**
 * 프로브(tmp/solapi-probe.mjs)로 확인된 카카오 발신프로필 채널 ID.
 * env SOLAPI_KAKAO_PF_ID 미설정 시 폴백 상수로 사용한다.
 * searchId "클래스인코리아" / phoneNumber 01059118522.
 */
export const DEFAULT_KAKAO_PF_ID = "KA01PF2607030241141841Yu8RL3EQMB"

/**
 * 기본 발신번호. env SOLAPI_SENDER_NUMBER 미설정 시 폴백.
 * 프로브에서 확인된 등록 전화번호(사용자 본인 번호).
 */
export const DEFAULT_SENDER_NUMBER = "01059118522"

/** 설정된 기본 발신번호(하이픈 제거). */
export function getDefaultSenderNumber(): string {
  return normalizePhoneNumber(process.env.SOLAPI_SENDER_NUMBER || DEFAULT_SENDER_NUMBER)
}

/** 설정된 카카오 발신프로필(pfId). */
export function getKakaoPfId(): string {
  return process.env.SOLAPI_KAKAO_PF_ID || DEFAULT_KAKAO_PF_ID
}

/** dry-run 모드 여부. env MESSAGING_DRY_RUN=1 이면 실발송 없이 simulated 처리. */
export function isDryRun(): boolean {
  return process.env.MESSAGING_DRY_RUN === "1"
}

/**
 * 전화번호 정규화: 하이픈/공백/괄호 제거.
 * solapi는 숫자만(01012345678) 받는다.
 */
export function normalizePhoneNumber(raw: string): string {
  return raw.replace(/[^0-9]/g, "")
}
