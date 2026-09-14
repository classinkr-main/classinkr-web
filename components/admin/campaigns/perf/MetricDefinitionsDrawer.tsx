"use client"

// 지표 정의 드로어 — 한눈에 층의 각주를 한 곳에 모은다.
//
// 재구성 전 요약 탭은 카드마다 정직 각주 1~3줄을 달아 정의를 밝혔다. 정직함은 그대로 두되 자리를
// 바꾼다: 타일 발치에는 한 줄만 남기고, 전문은 이 드로어에서 읽는다(기획 §3.3-6).
// 여기 문장은 lib/marketing/perf.ts · intake-feed.ts · lead-attribution.ts 의 규칙을 사람 말로
// 옮긴 것이다 — 정의가 바뀌면 코드와 이 목록을 함께 고친다.

import { BookOpen } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

const DEFINITIONS: ReadonlyArray<{ term: string; body: string }> = [
  {
    term: "리드 · 전 소스",
    body: "리드DB(public.leads)에 기간 안에 생성된 리드 수. 소스를 가리지 않고(메타·홈페이지·자료실·뉴스레터·채널톡·챗봇·수기) 테스트 리드는 뺀다. 이전 기간 대비는 같은 정의의 직전 창.",
  },
  {
    term: "광고비 · Meta USD",
    body: "Meta 일자 인사이트 스냅샷(meta_insights_daily)의 spend 합. 계정 통화(USD) 그대로이며 원화로 환산하거나 KRW 지표와 합산하지 않는다. 스냅샷이 아직 안 들어온 날은 0이 아니라 빈 칸.",
  },
  {
    term: "CPL 실측 · USD",
    body: "기간 광고비 ÷ 같은 기간 리드DB의 광고 리드(source = meta_lead_ads) 수. Meta 리포트의 leads 필드가 아니라 실제로 들어온 리드가 분모다. 일자별 CPL은 분모 정의가 달라 그리지 않는다.",
  },
  {
    term: "리드 전환율",
    body: "광고 리드 중 전환(converted)된 비율. 누적 상태 기준이라 일자 추이가 없다. 광고 리드가 있는데 전환이 0이면 붉게 표시한다.",
  },
  {
    term: "오늘 유입",
    body: "KST 오늘 00:00부터 지금까지 리드DB와 Compass 리드를 전화번호 정규화 키로 접은 수. 같은 사람이 양쪽에 있으면 1건. 어제 비교는 '어제 같은 시각까지' 창. 한쪽 원천이 죽으면 남은 쪽을 전체라 부르지 않고 미집계 배지를 단다.",
  },
  {
    term: "광고 퍼널",
    body: "노출·클릭은 Meta 스냅샷, 리드부터는 리드DB(광고 리드). 컨택은 누적 해석(신규 상태를 벗어난 리드, 전환·종료 포함)이라 항상 전환 이상이다. 단계 사이 숫자는 이전 단계 대비 전환율.",
  },
  {
    term: "캠페인 Top 3 · 스코어보드",
    body: "우산 캠페인(marketing_campaigns)에 링크된 Meta 캠페인의 일자 leads 합으로 순위를 매긴다. 이 리드는 Meta 리포트 축이라 위 '리드' 타일과 모집단이 다르다. 집행률은 예산과 집행 통화가 맞을 때만(USD-USD 또는 KRW-KRW) 계산한다.",
  },
  {
    term: "이상 신호",
    body: "순수 규칙 감지: CPL 급등(7일 CPL > 30일 × 1.5, 7일 리드 5건 이상), CTR 급락(7일 < 30일 × 0.6), 페이싱 초과(집행률 − 경과율 > 10%p), 리드 급감(최근 7일 < 직전 7일 × 0.6). 비교할 두 값이 실제로 있을 때만 발화한다.",
  },
  {
    term: "판정 상태 점",
    body: "정상 = 이상 신호 없음 · 주의 = 이상 신호 1건 이상 · 경고 = CPL 급등 또는 심각(high) 신호 또는 광고 리드 전원 미컨택 · 미측정 = 스냅샷과 리드 축이 모두 비어 판단 불가.",
  },
  {
    term: "Compass 파이프라인",
    body: "마케팅팀 앱(mkt.classin.co.kr)의 읽기 전용 브리지 뷰에서 세 수치(오늘 데모 · 48시간 내 다음 액션 · BD인계 진행)만 읽는다. 어드민은 쓰지 않는다.",
  },
  {
    term: "미측정(—)과 0",
    body: "— 는 소스 조회 실패·미수집·분모 0을 뜻하고, 0은 실측 0이다. 두 경우를 같은 숫자로 포장하지 않는다.",
  },
]

export function MetricDefinitionsDrawer({ triggerClassName }: { triggerClassName?: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={
            triggerClassName ??
            "inline-flex items-center gap-1 text-[12px] font-semibold text-[#084734] hover:underline"
          }
        >
          <BookOpen className="h-3.5 w-3.5" aria-hidden />
          이 화면의 숫자 정의
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-semibold tracking-[-0.01em] text-[#111110]">
            한눈에 층의 숫자 정의
          </DialogTitle>
          <DialogDescription className="text-[12px] text-[#615D59]">
            같은 말(리드)이 화면마다 다른 모집단을 가리킬 수 있어 정의를 한 곳에 모았습니다. 코드 정본은
            lib/marketing/perf.ts · intake-feed.ts · lead-attribution.ts 입니다.
          </DialogDescription>
        </DialogHeader>
        <dl className="mt-2 divide-y divide-[#f0f0ec]">
          {DEFINITIONS.map((item) => (
            <div key={item.term} className="grid gap-1 py-3 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4">
              <dt className="text-[12.5px] font-semibold text-[#111110]">{item.term}</dt>
              <dd className="text-[12px] leading-relaxed text-[#1a1a1a]/65">{item.body}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
