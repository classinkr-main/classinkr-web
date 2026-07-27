import "server-only"

export interface FxRates {
  usdKrw: number
  cnyKrw: number
  fetchedAt: string
  source: string
  isStale: boolean
}

export interface UsdKrwRate {
  rate: number
  fetchedAt: string
  source: string
  isStale: boolean
}

export interface CnyKrwRate {
  rate: number
  fetchedAt: string
  source: string
  isStale: boolean
}

type CachedRates = {
  usdKrw: number
  cnyKrw: number
  fetchedAt: string
  source: string
  expiresAt: number
}

// 30분 캐시. 자주 출렁이지 않는 값이므로 빈번한 호출 방지.
const CACHE_TTL_MS = 30 * 60 * 1000
const FETCH_TIMEOUT_MS = 5000
const USD_KRW_MIN = 500
const USD_KRW_MAX = 5000
const CNY_KRW_MIN = 50
const CNY_KRW_MAX = 500
const DEFAULT_USD_KRW = 1400
const DEFAULT_CNY_KRW = 190
const USD_RATE_ENDPOINT = "https://open.er-api.com/v6/latest/USD"

let cached: CachedRates | null = null

function readNumericEnv(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback
}

function readFallbackUsdKrw() {
  return readNumericEnv("USD_KRW_FALLBACK_RATE", DEFAULT_USD_KRW, USD_KRW_MIN, USD_KRW_MAX)
}

function readFallbackCnyKrw() {
  return readNumericEnv("CNY_KRW_FALLBACK_RATE", DEFAULT_CNY_KRW, CNY_KRW_MIN, CNY_KRW_MAX)
}

async function fetchRemoteRates(): Promise<CachedRates | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    const response = await fetch(USD_RATE_ENDPOINT, {
      signal: controller.signal,
      cache: "no-store",
    })
    clearTimeout(timeout)
    if (!response.ok) return null

    const data = (await response.json()) as {
      result?: string
      rates?: { KRW?: number; CNY?: number }
      time_last_update_utc?: string
    }

    if (data.result !== "success") return null
    const usdKrwRaw = data.rates?.KRW
    const usdCnyRaw = data.rates?.CNY
    if (typeof usdKrwRaw !== "number" || typeof usdCnyRaw !== "number") return null
    if (usdCnyRaw <= 0) return null

    const usdKrw = Math.round(usdKrwRaw * 100) / 100
    const cnyKrw = Math.round((usdKrwRaw / usdCnyRaw) * 100) / 100

    if (usdKrw < USD_KRW_MIN || usdKrw > USD_KRW_MAX) return null
    if (cnyKrw < CNY_KRW_MIN || cnyKrw > CNY_KRW_MAX) return null

    return {
      usdKrw,
      cnyKrw,
      fetchedAt: data.time_last_update_utc ?? new Date().toISOString(),
      source: "open.er-api.com",
      expiresAt: Date.now() + CACHE_TTL_MS,
    }
  } catch {
    return null
  }
}

export async function getFxRates(): Promise<FxRates> {
  if (cached && cached.expiresAt > Date.now()) {
    return {
      usdKrw: cached.usdKrw,
      cnyKrw: cached.cnyKrw,
      fetchedAt: cached.fetchedAt,
      source: cached.source,
      isStale: false,
    }
  }

  const fresh = await fetchRemoteRates()
  if (fresh) {
    cached = fresh
    return {
      usdKrw: fresh.usdKrw,
      cnyKrw: fresh.cnyKrw,
      fetchedAt: fresh.fetchedAt,
      source: fresh.source,
      isStale: false,
    }
  }

  if (cached) {
    return {
      usdKrw: cached.usdKrw,
      cnyKrw: cached.cnyKrw,
      fetchedAt: cached.fetchedAt,
      source: cached.source,
      isStale: true,
    }
  }

  return {
    usdKrw: readFallbackUsdKrw(),
    cnyKrw: readFallbackCnyKrw(),
    fetchedAt: new Date().toISOString(),
    source: "env_fallback",
    isStale: true,
  }
}

export async function getUsdKrwRate(): Promise<UsdKrwRate> {
  const rates = await getFxRates()
  return {
    rate: rates.usdKrw,
    fetchedAt: rates.fetchedAt,
    source: rates.source,
    isStale: rates.isStale,
  }
}

export async function getCnyKrwRate(): Promise<CnyKrwRate> {
  const rates = await getFxRates()
  return {
    rate: rates.cnyKrw,
    fetchedAt: rates.fetchedAt,
    source: rates.source,
    isStale: rates.isStale,
  }
}

export function convertUsdToKrw(amountUsd: number, rate: number) {
  if (!Number.isFinite(amountUsd) || amountUsd < 0) return 0
  if (!Number.isFinite(rate) || rate <= 0) return 0
  return Math.round(amountUsd * rate)
}

// convertCnyToKrw 는 충전형 KRW 전환(2026-07)으로 참조 0이 되어 제거했다.
// cnyKrw 환율 자체는 lib/admin-crm-neo.ts 의 USD/CNY 크로스 계산이 아직 쓰므로 유지한다.
