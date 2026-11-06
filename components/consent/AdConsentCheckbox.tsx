"use client"

import Link from "next/link"
import { useId } from "react"

import {
  AD_CONSENT_BOXES,
  AD_CONSENT_DETAILS,
  AD_CONSENT_SUMMARY,
  AD_CONSENT_TITLE,
  type AdConsentValue,
} from "@/lib/consent/ad-consent"
import { cn } from "@/lib/utils"

/**
 * 맞춤형 광고 활용 동의(선택) — 제3자 제공·국외 이전 두 칸. 기본은 둘 다 비어 있다.
 * 두 칸을 모두 골라야 동의다(isAdConsentGiven). 문구 정본은 lib/consent/ad-consent.ts.
 * 겉 상자 모양은 폼마다 다르니 className 으로 맞춘다(기본 = 상담 폼의 선택 칸).
 */
export function AdConsentCheckbox({
  value,
  onChange,
  className,
}: {
  value: AdConsentValue
  onChange: (next: AdConsentValue) => void
  className?: string
}) {
  const id = useId()
  const boxes = [
    { key: "provide", name: "ad-consent-provide", label: AD_CONSENT_BOXES.provide },
    { key: "transfer", name: "ad-consent-transfer", label: AD_CONSENT_BOXES.transfer },
  ] as const

  return (
    <div
      role="group"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-summary`}
      className={cn(
        "w-full min-w-0 rounded-2xl border border-black/[0.08] px-4 py-3 text-sm text-[#44514A]",
        className,
      )}
    >
      <p id={`${id}-title`} className="font-medium text-[#203127]">
        {AD_CONSENT_TITLE}
      </p>
      <p id={`${id}-summary`} className="mt-1 text-xs leading-5 text-[#615D59] break-keep">
        {AD_CONSENT_SUMMARY}
      </p>
      <div className="mt-2 space-y-1.5">
        {boxes.map((box) => (
          <label key={box.key} htmlFor={`${id}-${box.key}`} className="flex cursor-pointer items-start gap-3">
            <input
              id={`${id}-${box.key}`}
              name={box.name}
              type="checkbox"
              checked={value[box.key]}
              onChange={(e) => onChange({ ...value, [box.key]: e.target.checked })}
              className="mt-0.5 h-4 w-4 shrink-0 accent-fg-accent"
            />
            <span className="min-w-0 break-keep">{box.label}</span>
          </label>
        ))}
      </div>
      <details className="mt-2 text-xs leading-5 text-[#615D59]">
        <summary className="cursor-pointer font-medium text-[#44514A]">받는 곳·항목·기간 보기</summary>
        <ul className="mt-1.5 space-y-1 break-keep [overflow-wrap:anywhere]">
          {AD_CONSENT_DETAILS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
      {/* 새 탭으로 연다 — 같은 탭이면 모달·폼 입력이 사라진다 */}
      <Link
        href="/privacy#ad-consent"
        target="_blank"
        rel="noopener noreferrer"
        prefetch={false}
        className="mt-1.5 inline-block text-xs font-medium text-fg-accent underline underline-offset-2"
      >
        개인정보처리방침 5항 보기
      </Link>
    </div>
  )
}
