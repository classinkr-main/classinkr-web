// 한국어 표기 유틸 — 숫자·원화·날짜·시간·전화번호. 정본: docs/active/public-site-design-language-2026-10-26/system.md §5-6
import { formatKoreanPhone } from "@/lib/crm/phone"

const TZ = "Asia/Seoul" // Vercel 서버는 UTC
const MINUS = "−"
const nf = new Intl.NumberFormat("ko-KR")
const parts = (d: Date, o: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(new Intl.DateTimeFormat("ko-KR", { timeZone: TZ, ...o }).formatToParts(d).map((p) => [p.type, p.value]))

export const formatNumber = (n: number) => nf.format(n).replace("-", MINUS)
export const formatKRW = (n: number) => `${formatNumber(n)}원` // 표·가격: 붙여 쓴다
export function formatKRWCompact(n: number) {
  // 문장·헤드라인: 띄어 쓴다
  const sign = n < 0 ? MINUS : ""
  const abs = Math.abs(n)
  if (abs < 10_000) return `${sign}${nf.format(abs)}원`
  const totalMan = Math.round(abs / 10_000)
  const eok = Math.floor(totalMan / 10_000),
    man = totalMan % 10_000
  return `${sign}${[eok && `${nf.format(eok)}억`, man && `${nf.format(man)}만`].filter(Boolean).join(" ")} 원`
}
export function formatDate(d: Date | string, style: "meta" | "prose" = "meta") {
  const p = parts(new Date(d), { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
  return style === "meta" ? `${p.year}.${p.month}.${p.day}` : `${Number(p.month)}월 ${Number(p.day)}일(${p.weekday})`
}
export function formatTime(d: Date | string) {
  const p = parts(new Date(d), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
  return `${p.hour}:${p.minute}`
}
export function formatPhone(v: string) {
  // 대표번호 8자리만 새로 처리
  const d = v.replace(/\D/g, "")
  return /^1[568]\d{6}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4)}` : formatKoreanPhone(v)
}
