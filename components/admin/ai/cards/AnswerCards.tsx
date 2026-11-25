"use client"

import { useState } from "react"
import Link from "next/link"
import { Check, ExternalLink, Info } from "lucide-react"

import {
  contactCheckStatus,
  isContactEmpty,
  isCustomerSafeAnswer,
} from "@/lib/admin-ai/answers"
import { copyText } from "@/lib/admin-ai/copy"
import { getLinkById, type LinkEntry } from "@/lib/admin-ai/links"
import { adminAiStore } from "@/lib/admin-ai/store"
import type {
  AnswerCard,
  AnswerSource,
  AnswerSourceKind,
  ContactCard,
  ContactPerson,
  LinksCard,
} from "@/lib/admin-ai/types"
import { aiButtonClass, CardNote, CardShell, PreviewBand } from "./CardShell"

// 묻기(R0) 카드 3종 — 답 · 링크 · 담당자(기획 §11.9). 아무것도 바꾸지 않으므로 확인 절차가 없다.
// 값의 판정(고객에게 그대로 말해도 되나, 확인일이 오래됐나)은 lib/admin-ai/answers.ts 의 코드가 한다.

type BadgeTone = "green" | "warn" | "neutral"

const BADGE_TONE: Record<BadgeTone, string> = {
  green: "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]",
  warn: "border-[#ECD29C] bg-[#FDF6E7] text-[#7A520F]",
  neutral: "border-[#E8E8E4] bg-[#F6F5F4] text-[#615D59]",
}

/** 색만으로 뜻을 전하지 않는다 — 항상 글자를 함께 둔다. */
function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-[7px] py-[2px] text-[11px] font-semibold ${BADGE_TONE[tone]}`}
    >
      {children}
    </span>
  )
}

const SOURCE_KIND_LABEL: Record<AnswerSourceKind, string> = {
  public: "공개 문서",
  internal: "사내 문서",
  consultation: "상담 사례",
}

function SourceRow({ source }: { source: AnswerSource }) {
  const link = source.linkId ? getLinkById(source.linkId) : undefined
  // 근거 문서는 어드민 화면으로만 연다 — 고객용 공개 주소를 근거 줄에 붙이지 않는다.
  const openable = link?.audience === "internal" ? link : undefined

  return (
    <li className="flex flex-col gap-1 border-t border-[#F0F0EC] py-[7px] first:border-t-0 first:pt-0">
      <p className="text-[12px] leading-[1.4] text-[#111110]">
        <span className="font-semibold">{source.title}</span>
        {source.where ? <span className="text-[#615D59]"> · {source.where}</span> : null}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral">{SOURCE_KIND_LABEL[source.kind]}</Badge>
        <Badge tone={source.status === "confirmed" ? "green" : "warn"}>
          {source.status === "confirmed" ? "확정" : "확인 필요"}
        </Badge>
        {source.externalUse ? null : <Badge tone="neutral">고객에게 그대로 쓰지 않음</Badge>}
        {openable ? (
          <Link href={openable.href} className={`${aiButtonClass("ghost")} !px-2 !py-[3px]`}>
            문서 열기
          </Link>
        ) : null}
      </div>
    </li>
  )
}

/** 정보 질문의 답 — 바로 답, 확정 여부, 고객 전달 가능 여부, 근거 출처. 고객 문안은 CS 코파일럿에서 만든다. */
export function AnswerCardView({ card }: { card: AnswerCard }) {
  const preview = adminAiStore.mode === "demo"
  const customerSafe = isCustomerSafeAnswer(card)
  const copilot = getLinkById("admin:cs-chatbot")

  return (
    <CardShell
      icon="search"
      title={card.title}
      target={card.target}
      riskCode="R0"
      riskName="묻기"
      tone="neutral"
      footer={
        copilot?.audience === "internal" ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href={copilot.href} className={aiButtonClass("secondary")}>
              CS 코파일럿 열기
            </Link>
            <span className="text-[11px] text-[#615D59]">고객에게 보낼 문안은 여기서 만듭니다</span>
          </div>
        ) : undefined
      }
    >
      {preview ? <PreviewBand /> : null}
      <p className="text-[13px] font-semibold leading-[1.55] text-[#111110]">{card.answer}</p>
      {card.steps && card.steps.length > 0 ? (
        <section aria-label="방법">
          <h5 className="mb-1 text-[11px] font-semibold text-[#A39E98]">방법</h5>
          <ol className="list-decimal space-y-0.5 pl-5 text-[12px] leading-[1.5] text-[#31302E]">
            {card.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ) : null}
      {card.cautions && card.cautions.length > 0 ? (
        <section aria-label="조건·주의">
          <h5 className="mb-1 text-[11px] font-semibold text-[#A39E98]">조건·주의</h5>
          <ul className="list-disc space-y-0.5 pl-5 text-[12px] leading-[1.5] text-[#7A520F]">
            {card.cautions.map((caution) => (
              <li key={caution}>{caution}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={card.confidence === "confirmed" ? "green" : "warn"}>
          {card.confidence === "confirmed" ? (
            <>
              <Check className="h-3 w-3" aria-hidden="true" />
              확정
            </>
          ) : (
            "확인 필요"
          )}
        </Badge>
        <Badge tone={customerSafe ? "green" : "warn"}>
          {customerSafe ? "고객에게 그대로 말해도 됨" : "내부용 — 그대로 보내지 마세요"}
        </Badge>
      </div>
      <section aria-label="근거">
        <h5 className="mb-1 text-[11px] font-semibold text-[#A39E98]">근거</h5>
        {card.sources.length > 0 ? (
          <ul>
            {card.sources.map((source) => (
              <SourceRow key={`${source.title}|${source.where ?? ""}`} source={source} />
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-[#7A520F]">확인된 근거가 없습니다. 추측해서 답하지 않았습니다.</p>
        )}
      </section>
      {card.customerDraft ? (
        // 고객용 문안 — 공개 챗봇이 고객에게 내는 말투 그대로. 매니저 답과 섞지 않고 접어 둔다(점검 R18).
        <details className="rounded-lg border border-[#F0F0EC] bg-[#FAFAF8] px-[11px] py-[8px] text-[12px]">
          <summary className="cursor-pointer text-[11px] font-semibold text-[#615D59]">
            고객용 문안 · {card.customerDraft.status === "confirmed" ? "공개 답" : "확인 필요"}
          </summary>
          <p className="mt-1.5 whitespace-pre-line leading-[1.5] text-[#31302E]">{card.customerDraft.text}</p>
          {card.customerDraft.note ? (
            <p className="mt-1 text-[11px] text-[#7A520F]">{card.customerDraft.note}</p>
          ) : null}
        </details>
      ) : null}
      {card.note ? (
        <CardNote icon={<Info className="h-3 w-3" aria-hidden="true" />}>{card.note}</CardNote>
      ) : null}
    </CardShell>
  )
}

type CopyState = "idle" | "copied" | "failed"

function LinkRow({ entry }: { entry: LinkEntry }) {
  const [copy, setCopy] = useState<CopyState>("idle")
  const customer = entry.audience === "customer"
  // 복사하는 값: 고객용은 절대 주소 하나, 내부용은 어드민 경로(고객에게 보내는 값이 아니다).
  const value = customer ? entry.url : entry.href

  async function onCopy() {
    setCopy((await copyText(value)) ? "copied" : "failed")
  }

  return (
    <li className="flex flex-col gap-1.5 border-t border-[#F0F0EC] py-2 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] font-semibold text-[#111110]">{entry.label}</span>
        {customer ? (
          <Badge tone="green">고객용 · 공개 주소</Badge>
        ) : (
          <Badge tone="neutral">내부용 · 고객에게 보내지 마세요</Badge>
        )}
        {entry.requires ? (
          <Badge tone="warn">필요 역할 · {entry.requires.join(", ")}</Badge>
        ) : null}
      </div>
      <p className="break-all font-mono text-[11px] text-[#615D59]">{value}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {customer ? (
          <>
            <button type="button" onClick={onCopy} className={aiButtonClass("primary")}>
              {copy === "copied" ? "복사됨" : "고객용 주소 복사"}
            </button>
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              className={aiButtonClass("secondary")}
            >
              새 탭에서 보기
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only"> (새 탭)</span>
            </a>
          </>
        ) : (
          <>
            <Link href={entry.href} className={aiButtonClass("secondary")}>
              열기
            </Link>
            <button type="button" onClick={onCopy} className={aiButtonClass("ghost")}>
              {copy === "copied" ? "복사됨" : "경로 복사"}
            </button>
          </>
        )}
      </div>
      {copy === "failed" ? (
        <div role="status" className="flex flex-col gap-1">
          <p className="text-[11px] text-[#7A520F]">
            복사하지 못했습니다. 아래 주소를 선택해 직접 복사해 주세요.
          </p>
          <input
            readOnly
            value={value}
            aria-label={`${entry.label} 주소`}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full rounded-md border border-[#E8E8E4] bg-white px-2 py-[5px] font-mono text-[11px] text-[#111110] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
          />
        </div>
      ) : copy === "copied" ? (
        <p role="status" className="sr-only">
          {entry.label} 주소를 복사했습니다
        </p>
      ) : null}
    </li>
  )
}

/**
 * 링크 목록 — 줄은 링크 목록(links.ts)의 id 로만 받는다. 목록에 없는 id 는 그리지 않는다.
 * 어드민 바로가기(내부용)와 고객에게 보내도 되는 공개 주소(고객용)를 줄마다 구분해 보인다.
 */
export function LinksCardView({ card }: { card: LinksCard }) {
  const preview = adminAiStore.mode === "demo"
  const entries = card.items
    .map((item) => ({ item, entry: getLinkById(item.linkId) }))
    .filter((row): row is { item: LinksCard["items"][number]; entry: LinkEntry } => Boolean(row.entry))

  return (
    <CardShell
      icon="link"
      title={card.title}
      target={card.target}
      riskCode="R0"
      riskName="묻기"
      tone="neutral"
    >
      {preview ? <PreviewBand /> : null}
      {entries.length > 0 ? (
        <ul>
          {entries.map(({ entry }) => (
            <LinkRow key={entry.id} entry={entry} />
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-[#615D59]">
          목록에 있는 링크를 찾지 못했습니다. 없는 주소를 지어내지 않습니다.
        </p>
      )}
      {card.note ? (
        <CardNote icon={<Info className="h-3 w-3" aria-hidden="true" />}>{card.note}</CardNote>
      ) : null}
    </CardShell>
  )
}

function PersonLine({ label, person }: { label: string; person: ContactPerson }) {
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2 border-t border-[#F0F0EC] py-[6px] first:border-t-0 first:pt-0">
      <dt className="text-[11px] font-semibold text-[#A39E98]">{label}</dt>
      <dd className="text-[12px] leading-[1.45] text-[#111110]">
        <strong className="font-semibold">{person.role}</strong>
        {person.name ? <span> · {person.name}</span> : null}
        {person.channel ? <span className="block text-[#615D59]">{person.channel}</span> : null}
      </dd>
    </div>
  )
}

/**
 * 담당자 — 1차·대리·준비해 갈 것·연락 채널·확인일. 담당표에 줄이 없으면 "담당표 미입력"을 그대로 보이고
 * 추측한 사람을 알려 주지 않는다. 확인일이 90일을 넘으면 "확인 오래됨"을 단다.
 */
export function ContactCardView({ card, now }: { card: ContactCard; now: number }) {
  const preview = adminAiStore.mode === "demo"
  const empty = isContactEmpty(card)
  const check = contactCheckStatus(card.checkedAt, now)

  return (
    <CardShell
      icon="lead"
      title={card.title}
      target={card.target}
      riskCode="R0"
      riskName="묻기"
      tone="neutral"
    >
      {preview ? <PreviewBand /> : null}
      {empty ? (
        <div className="flex flex-col gap-1.5">
          <Badge tone="warn">담당표 미입력</Badge>
          <p className="text-[12px] leading-[1.5] text-[#615D59]">
            이 주제의 담당이 담당표에 없습니다. 추측해서 사람을 알려 드리지 않습니다.
          </p>
        </div>
      ) : (
        <dl>
          {card.primary ? <PersonLine label="1차" person={card.primary} /> : null}
          {card.backup ? <PersonLine label="대리" person={card.backup} /> : null}
        </dl>
      )}
      {card.prepare && card.prepare.length > 0 ? (
        <section aria-label="준비해 갈 것">
          <h5 className="mb-1 text-[11px] font-semibold text-[#A39E98]">준비해 갈 것</h5>
          <ul className="list-disc pl-4 text-[12px] leading-[1.5] text-[#111110]">
            {card.prepare.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {empty ? null : (
        <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#615D59]">
          확인일
          {check === "missing" ? (
            <Badge tone="warn">확인일 미입력</Badge>
          ) : check === "invalid" ? (
            <Badge tone="warn">확인일 형식 오류 · {card.checkedAt}</Badge>
          ) : (
            <>
              <time dateTime={card.checkedAt}>{card.checkedAt}</time>
              {check === "stale" ? <Badge tone="warn">확인 오래됨</Badge> : null}
            </>
          )}
        </p>
      )}
      {card.note ? (
        <CardNote icon={<Info className="h-3 w-3" aria-hidden="true" />}>{card.note}</CardNote>
      ) : null}
    </CardShell>
  )
}
