import "server-only"

import { createHmac, timingSafeEqual } from "crypto"

function getTokenSecret() {
  const secret =
    process.env.SECURITY_TOKEN_SECRET?.trim() ??
    process.env.SESSION_SECRET?.trim() ??
    (process.env.NODE_ENV !== "production" ? process.env.ADMIN_PASSWORD?.trim() : undefined)

  if (!secret) {
    throw new Error("Missing SECURITY_TOKEN_SECRET or SESSION_SECRET.")
  }

  return secret
}

function sign(scope: string, payload: string) {
  return createHmac("sha256", getTokenSecret())
    .update(`${scope}:${payload}`)
    .digest("base64url")
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function createCheckoutToken(orderId: string, amount: number) {
  return sign("checkout", `${orderId}:${amount}`)
}

export function verifyCheckoutToken(orderId: string, amount: number, token: unknown) {
  if (typeof token !== "string" || !token) return false
  return safeEqual(createCheckoutToken(orderId, amount), token)
}

export function createUnsubscribeToken(email: string) {
  return sign("unsubscribe", email.trim().toLowerCase())
}

export function verifyUnsubscribeToken(email: string, token: unknown) {
  if (typeof token !== "string" || !token) return false
  return safeEqual(createUnsubscribeToken(email), token)
}

// ── 이메일 클릭 추적(2026-08-18) ─────────────────────────────────────────────
// /api/track/click 은 공개 리다이렉터가 될 수 있어 목적지 URL 을 HMAC 으로 서명한다 —
// 서명이 맞는(=우리가 발송 시점에 만든) cid+URL 조합만 리다이렉트한다.

export function createEmailClickToken(campaignId: string, url: string) {
  return sign("email-click", `${campaignId}:${url}`)
}

export function verifyEmailClickToken(campaignId: string, url: string, token: unknown) {
  if (typeof token !== "string" || !token) return false
  return safeEqual(createEmailClickToken(campaignId, url), token)
}

export function createEmailClickUrl(baseUrl: string, campaignId: string, targetUrl: string) {
  const url = new URL("/api/track/click", baseUrl)
  url.searchParams.set("cid", campaignId)
  url.searchParams.set("u", targetUrl)
  url.searchParams.set("sig", createEmailClickToken(campaignId, targetUrl))
  return url.toString()
}

export function createUnsubscribeUrl(baseUrl: string, email: string) {
  const url = new URL("/api/newsletter/unsubscribe", baseUrl)
  url.searchParams.set("email", email)
  url.searchParams.set("token", createUnsubscribeToken(email))
  return url.toString()
}
