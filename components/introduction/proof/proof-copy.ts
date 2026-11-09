// /introduction/proof — 「현장 사례 중심」 전달 자료(시안 5) 전용 문구와 조립 데이터.
// 사실·숫자·사례 이름·사진 설명(alt)·영상은 lib/introduction/content.ts 에서 읽는다(수정 금지 원천).
// 여기 새로 쓴 것은 시안 5의 헤드라인·요약 문장뿐이고, 그 문장들의 사실도 content.ts 원문에 있는 것만 쓴다.
// 화면 수치(사례 수·분야별 수·영상 편수)는 content.ts 배열 길이에서 계산한다 — 사례가 늘면 문구가 따라 바뀐다.

import type { IntroAssetKey } from "@/lib/introduction/assets"
import {
  INTRO_CASES,
  INTRO_CASE_FILTERS,
  INTRO_CASE_VIDEOS,
  INTRO_DOWNLOADS,
  INTRO_FINAL_CTA,
  INTRO_HERO,
  INTRO_PATH,
  INTRO_SMART_CLASSROOM,
  INTRO_SOFTWARE,
  getIntroCase,
  getIntroCasePath,
  type IntroBlock,
  type IntroCase,
  type IntroCaseSector,
  type IntroDownload,
  type IntroVideo,
} from "@/lib/introduction/content"

export const PROOF_PATH = `${INTRO_PATH}/proof`
/** click_cta·download_materials·view_demo_video 의 source 값 */
export const PROOF_SOURCE = "introduction_proof"

// ─── content.ts 조회 ─────────────────────────────────────────────────────────

function caseOf(slug: string): IntroCase {
  const found = getIntroCase(slug)
  if (!found) throw new Error(`[proof-copy] content.ts 에 없는 사례: ${slug}`)
  return found
}

// 사진 설명(alt)은 원천 한 곳에서 읽는다 — 사례 본문·스마트 교실 특징 사진·특장점 화면·구성도
const IMAGE_ALTS = new Map<IntroAssetKey, string>()
function collectAlts(blocks: IntroBlock[]) {
  for (const block of blocks) {
    if (block.type === "image") IMAGE_ALTS.set(block.asset, block.alt)
    else if (block.type === "imageRow") block.images.forEach((image) => IMAGE_ALTS.set(image.asset, image.alt))
    else if (block.type === "toggle" || block.type === "callout") collectAlts(block.blocks)
  }
}
INTRO_CASES.forEach((item) => collectAlts(item.body))
INTRO_SMART_CLASSROOM.features.forEach((feature) =>
  feature.images.forEach((image) => IMAGE_ALTS.set(image.asset, image.alt))
)
INTRO_SOFTWARE.features.forEach((feature) => IMAGE_ALTS.set(feature.media.asset, feature.media.alt))
IMAGE_ALTS.set(INTRO_SMART_CLASSROOM.hero.asset, INTRO_SMART_CLASSROOM.hero.alt)

function altOf(asset: IntroAssetKey): string {
  const alt = IMAGE_ALTS.get(asset)
  if (!alt) throw new Error(`[proof-copy] content.ts 에 설명(alt)이 없는 사진: ${asset}`)
  return alt
}

/** 사례 본문에 실린 영상 한 편(정율 학원 투어·과사람 완공 기념식) */
function caseVideo(slug: string): IntroVideo {
  const block = caseOf(slug).body.find((item): item is Extract<IntroBlock, { type: "video" }> => item.type === "video")
  if (!block) throw new Error(`[proof-copy] 사례 본문에 영상이 없음: ${slug}`)
  return block.video
}

function videoGroup(id: string) {
  const group = INTRO_CASE_VIDEOS.groups.find((item) => item.id === id)
  if (!group) throw new Error(`[proof-copy] 고객 사례 영상 묶음이 없음: ${id}`)
  return group
}

function folio(n: number) {
  return String(n).padStart(2, "0")
}

/** 한국이 아닌 사례만 나라를 붙인다(이름 옆 작은 글자) */
function foreignCountry(item: IntroCase): string | null {
  return item.country === "한국" ? null : item.country
}

const CASE_TOTAL = INTRO_CASES.length
const COUNTRIES = [...new Set(INTRO_CASES.map((item) => item.country))]

const CONTACT = INTRO_FINAL_CTA.primary
const SHOWROOM = INTRO_FINAL_CTA.secondary

export interface ProofPhoto {
  asset: IntroAssetKey
  alt: string
  caption?: string
}

function photo(asset: IntroAssetKey, caption?: string): ProofPhoto {
  return { asset, alt: altOf(asset), caption }
}

// ─── 메타 ────────────────────────────────────────────────────────────────────

export const PROOF_META = {
  title: "학원과 학교는 이미 이렇게 수업합니다 — 클래스인 현장 사례",
  description: `부천 정율사관학원·아신대학교·부산 과사람학원·한국디지털미디어고등학교 등 클래스인으로 수업하는 ${CASE_TOTAL}곳의 실제 교실 사진과 수업 영상, 교실 구성을 모았습니다.`,
}

// ─── 표지 ────────────────────────────────────────────────────────────────────

export interface ProofMosaicTile extends ProofPhoto {
  /** 사진 속 교실 이름 */
  place: string
  /** 이름 뒤 짧은 설명(나라 포함) */
  note: string
}

function caseTile(slug: string, asset: IntroAssetKey, note: string): ProofMosaicTile {
  const item = caseOf(slug)
  const country = foreignCountry(item)
  return { ...photo(asset), place: item.name, note: country ? `${note} · ${country}` : note }
}

export const PROOF_HERO = {
  kicker: INTRO_HERO.title,
  titleLines: ["학원과 학교는 이미", "이렇게 수업합니다"],
  lead: `부천의 하이브리드 학원부터 싱가포르국립대학교 강의실까지. 클래스인으로 수업하는 ${CASE_TOTAL}곳의 실제 교실을 먼저 보시고, 우리 기관에 맞는 구성을 상담받으세요.`,
  primary: { label: CONTACT.label, href: CONTACT.href, ctaId: "introduction_proof_hero_contact" },
  secondary: { label: SHOWROOM.label, href: SHOWROOM.href, ctaId: "introduction_proof_hero_showroom" },
  download: INTRO_DOWNLOADS.introduction,
  legendTitle: "사진 속 교실",
  // 순서 = 모자이크 번호(01–08). 한국학원대·동인천종로엠은 아래 사례 카드 표지와 겹치지 않는 사진을 쓴다
  mosaic: [
    caseTile("bucheon-jungyul", "cases/bucheon-jungyul-2", "하이브리드 강의실"),
    caseTile("icheon-aidabom", "cases/icheon-aidabom-2", "교육 공간의 전자칠판"),
    caseTile("peking-university", "cases/peking-university-1", "스마트 교실"),
    caseTile("busan-yerim", "cases/busan-yerim-1", "전자칠판 판서 수업"),
    caseTile("korea-hakwon-university", "cases/korea-hakwon-university-2", "강연장 전자칠판"),
    caseTile("dongincheon-jongro-m", "cases/dongincheon-jongro-m-2", "강의실 전자칠판"),
    caseTile("national-university-of-singapore", "cases/national-university-of-singapore-1", "스마트 강의실"),
    { ...photo("smart-hybrid-1"), place: "클래스인 하이브리드 강의실", note: "교실과 원격 참여 학생이 한 화면에" },
  ] satisfies ProofMosaicTile[],
}

// ─── 기관 띠 ─────────────────────────────────────────────────────────────────

export interface ProofSectorGroup {
  id: IntroCaseSector
  label: string
  institutions: Array<{ slug: string; name: string; country: string | null }>
}

export const PROOF_INSTITUTIONS = {
  title: "클래스인으로 수업하는 기관",
  total: CASE_TOTAL,
  unit: "곳",
  countries: COUNTRIES.join(" · "),
  groups: INTRO_CASE_FILTERS.flatMap((filter): ProofSectorGroup[] =>
    filter.id === "all"
      ? []
      : [
          {
            id: filter.id,
            label: filter.label,
            institutions: INTRO_CASES.filter((item) => item.sector === filter.id).map((item) => ({
              slug: item.slug,
              name: item.name,
              country: foreignCountry(item),
            })),
          },
        ]
  ),
}

// ─── 01 현장 사례 ────────────────────────────────────────────────────────────

export interface ProofStory {
  slug: string
  name: string
  href: string
  /** 사례 01 · 사교육 · 한국 */
  label: string
  pull: string
  body: string
  facts: Array<{ term: string; detail: string }>
  /** split 이야기는 [큰 사진, 작은 사진, 작은 사진], pair 이야기는 [사진, 사진] */
  photos: ProofPhoto[]
}

function story(index: number, slug: string, copy: Omit<ProofStory, "slug" | "name" | "href" | "label">): ProofStory {
  const item = caseOf(slug)
  return {
    slug,
    name: item.name,
    href: getIntroCasePath(slug),
    label: `사례 ${folio(index)} · ${item.sector} · ${item.country}`,
    ...copy,
  }
}

const smartLectureCaption = INTRO_SMART_CLASSROOM.features
  .flatMap((feature) => feature.images)
  .find((image) => image.asset === "smart-lecture-2")
  ?.caption?.split(" — ")[0]

export const PROOF_STORIES = {
  id: "stories",
  folio: "01",
  kicker: "현장 사례",
  title: "네 곳의 교실, 네 가지 쓰임",
  lead: "같은 클래스인이라도 교실마다 쓰는 방식이 다릅니다. 지역을 넘는 하이브리드 수업, 해외 교수 초빙과 수업 녹화, 듀얼 스크린, 교실마다 같은 환경까지 — 네 기관의 실제 운영 방식을 사진과 함께 정리했습니다.",
  linkLabel: "사례 보기",
  split: [
    story(1, "bucheon-jungyul", {
      pull: "수업은 부천에서, 참여는 부산·대구·대치동에서도.",
      body: "정율사관학원의 모든 수업은 하이브리드로 진행됩니다. 수업은 부천에서 열리지만, 학생은 부산·대구·대치동 등 다른 지역에서 모집되어 실시간으로 함께 참여하기도 합니다. 실시간 수업 외에 온라인 강의를 촬영해 녹화 수업으로 판매하기도 합니다.",
      facts: [
        { term: "교실 구성", detail: "모든 교실에 전자칠판(86″ 또는 110″), 전후면 카메라(T1&S1)" },
        { term: "운영", detail: "실시간 하이브리드 수업 · 녹화 수업 판매" },
      ],
      photos: [
        photo("cases/bucheon-jungyul-1", "정율사관학원 스마트 교실 전경"),
        photo("cases/bucheon-jungyul-3", "강의실에서 수업을 듣는 학생들"),
        photo("smart-lecture-2", smartLectureCaption ?? "정율사관학원 강의 장면"),
      ],
    }),
    story(2, "acts-university", {
      pull: "해외 교수를 초빙하고, 어디서든 참여하고, 모든 수업을 녹화합니다.",
      body: "아신대학교는 스마트 교실 솔루션으로 해외의 교수자를 초빙하거나, 학생들이 공간의 제약 없이 자유롭게 수업에 참여하도록 보장합니다. 모든 수업은 실시간으로 녹화되어 이후 복습 자료로 쓰입니다.",
      facts: [
        { term: "교실 구성", detail: "전자칠판·천장형 마이크(DT1)·전후면 카메라(T1&S1)" },
        { term: "운영", detail: "해외 교수 초빙 · 원격 참여 · 전 수업 실시간 녹화" },
      ],
      photos: [
        photo("cases/acts-university-2", "후면 카메라를 통해 강의자 화면 송출"),
        photo("cases/acts-university-1", "강의실 전자칠판 — ACTS University × ClassIn"),
        photo("cases/acts-university-3", "스마트 강의실 전경"),
      ],
    }),
  ],
  pair: [
    story(3, "busan-gwasaram", {
      pull: "86″ 전자칠판 두 대, 교실 어디에 앉아도 보이는 칠판.",
      body: "과사람학원은 86″ 전자칠판 두 대를 연결해 듀얼 스크린으로 씁니다. 수업에 따라 확장 화면 또는 복제 화면으로 쓰며, 복제 화면으로 쓰면 학생이 교실 어디에 앉아 있어도 칠판 시야가 확보됩니다.",
      facts: [
        { term: "교실 구성", detail: "86″ 전자칠판 2대 연결(듀얼 스크린)" },
        { term: "화면 운영", detail: "수업에 따라 확장 또는 복제" },
      ],
      photos: [
        photo("cases/busan-gwasaram-1", "듀얼 전자칠판을 복제 화면으로 쓰는 모습"),
        photo("cases/busan-gwasaram-2", "듀얼 전자칠판으로 진행하는 수업"),
      ],
    }),
    story(4, "korea-digital-media-high-school", {
      pull: "교실마다 같은 하이브리드 수업 환경.",
      body: "한국디지털미디어고는 86인치 ClassIn X 전자칠판과 모션 트래킹 카메라를 도입해 교실마다 일관된 하이브리드 수업 환경을 구축했습니다. 실시간 판서, 원격 참여, 자동 녹화 기능을 통합해 수업 몰입도와 운영 효율성을 함께 높였습니다.",
      facts: [
        { term: "교실 구성", detail: "86인치 ClassIn X 전자칠판 · 모션 트래킹 카메라" },
        { term: "통합 기능", detail: "실시간 판서·원격 참여·자동 녹화" },
      ],
      photos: [
        photo("cases/korea-digital-media-high-school-1", "교실에 설치된 ClassIn X 전자칠판"),
        photo("cases/korea-digital-media-high-school-3", "스마트 교실 수업 장면"),
      ],
    }),
  ],
}

// ─── 02 수업 영상 ────────────────────────────────────────────────────────────

export interface ProofVideoGroup {
  id: string
  title: string
  meta: string
  text: string
  /** pair: 가로 두 편 · mixed: 가로 + 세로 섞임 · trio: 가로 세 편 */
  layout: "pair" | "mixed" | "trio"
  videos: IntroVideo[]
}

const recording = videoGroup("recording")
const tablet = videoGroup("tablet")
const tourVideos: IntroVideo[] = [caseVideo("bucheon-jungyul"), caseVideo("busan-gwasaram"), INTRO_SOFTWARE.video]

export const PROOF_VIDEOS = {
  id: "videos",
  folio: "02",
  kicker: "수업 영상",
  title: "교실에서 찍은 수업, 영상으로",
  lead: "클래스인 전자칠판과 카메라로 녹화한 강의, 학생의 개인 칠판을 함께 보는 화판 수업, 학원 현장 영상까지 — 고객 사례 영상으로 확인해 보세요.",
  groups: [
    {
      id: recording.id,
      title: recording.title,
      meta: `영상 ${recording.videos.length}편 · YouTube`,
      text: "클래스인 전자칠판과 카메라로 선명한 수업 영상을 녹화합니다. 카메라 뷰 외에 칠판 화면도 별도로 녹화되어 편집에 활용할 수 있습니다.",
      layout: "pair",
      videos: recording.videos,
    },
    {
      id: tablet.id,
      title: tablet.title,
      meta: `영상 ${tablet.videos.length}편 · 개인 칠판 기능`,
      text: "학생의 필기를 실시간으로 확인하고 첨삭하는 [개인 칠판] 기능을 쓰는 수업입니다. 정율사관학원, 과사람학원, 세정학원 등에서 학생의 이해도를 정확히 파악하고 맞춤형 수업을 하기 위해 이 방식을 채택하고 있습니다.",
      layout: "mixed",
      videos: tablet.videos,
    },
    {
      id: "tour",
      title: "현장 둘러보기",
      meta: `영상 ${tourVideos.length}편 · 학원 투어 · 기념식 · 클래스인 소개`,
      text: "정율사관학원의 클래스인 시스템 활용, 과사람학원 완공 기념식, 그리고 클래스인이 소개하는 인터랙티브 하이브리드 수업을 영상으로 보세요.",
      layout: "trio",
      videos: tourVideos,
    },
  ] satisfies ProofVideoGroup[],
}

// ─── 03 제품 ─────────────────────────────────────────────────────────────────

// 특장점 6개의 한두 줄 요약 — 각 항목의 요점(content.ts features.points·details)만 줄였다.
// 키는 content.ts 특장점 id 다. 빠진 id 가 있으면 featureSummary 가 빌드 때 멈춘다
const FEATURE_SUMMARIES: Record<string, string> = {
  teach: "수업 중심으로 설계된 30여 가지 실시간 수업 도구와 최대 50페이지 칠판. 학생에게 권한을 주면 함께 판서합니다.",
  materials: "개인·공유 드라이브로 기관 자료를 나누고, 별도 설비 없이 칠판·카메라 듀얼 자동 녹화.",
  manage: "LMS로 녹화 수업·숙제·시험을 관리하고, 표준 커리큘럼 배포와 실시간 모니터링까지.",
  data: "출결·성적·녹화본·스크린샷이 자동 저장되어 관리자 대시보드에 모입니다. 기관 시스템과 API 연동.",
  ai: "기관 맞춤형 AI 에이전트와 AI 튜터, 학습 분석 기반 개인화 피드백, 수업 중 AI 음성 어시스턴트.",
  anywhere: "전자칠판·PC·휴대폰·태블릿(iOS·Android)에서 최대 2,000명 참여, 학생 카메라 49개 동시 송출.",
}

function featureSummary(id: string): string {
  const summary = FEATURE_SUMMARIES[id]
  if (!summary) throw new Error(`[proof-copy] 특장점 요약이 없음: ${id}`)
  return summary
}

export const PROOF_PRODUCT = {
  id: "product",
  folio: "03",
  kicker: "제품",
  title: "이 교실들이 쓰는 것",
  lead: "수업 플랫폼 클래스인과, 전자칠판·AI 카메라·마이크를 클래스인과 연결한 AI 스마트 교실 클래스인 X.",
  software: {
    title: "클래스인",
    tag: "수업 플랫폼",
    lead: INTRO_SOFTWARE.lead,
    features: INTRO_SOFTWARE.features.map((feature) => ({
      id: feature.id,
      title: feature.title,
      image: photo(feature.media.asset),
      summary: featureSummary(feature.id),
    })),
  },
  hardware: {
    title: "클래스인 X",
    tag: "AI 스마트 교실",
    lead: INTRO_SMART_CLASSROOM.lead,
    diagram: photo(INTRO_SMART_CLASSROOM.hero.asset, "하이브리드 교실 구성 — 전자칠판, AI 트래킹 카메라, 천장 마이크"),
    // 「차원이 다른 터치 & 필기 감도」·「하이브리드 환경에 최적화된 장비 내장」·「기술 스펙 요약」 원문 수치
    specs: [
      { value: "2ms", label: "터치 반응 속도" },
      { value: "0.03~0.06초", label: "필기 인식 · 종이에 쓰는 듯한 필기감" },
      { value: "8개", label: "배열 마이크 + AI 음성 추적 카메라" },
      { value: "4K", label: "65·75·86·110인치 전자칠판" },
    ],
    downloads: [INTRO_DOWNLOADS.smartClassroom, INTRO_DOWNLOADS.introduction] satisfies IntroDownload[],
  },
  overview: { label: "클래스인 서비스 소개 전체 보기", href: INTRO_PATH, ctaId: "introduction_proof_product_overview" },
}

// ─── 04 전체 사례 ────────────────────────────────────────────────────────────

export const PROOF_ALL_CASES = {
  id: "all-cases",
  folio: "04",
  kicker: "전체 사례",
  title: `${CASE_TOTAL}곳의 교실 모두 보기`,
  lead: "기관 유형으로 골라 보세요. 카드를 누르면 사례 상세 페이지가 열립니다.",
}

// ─── 마무리 CTA ──────────────────────────────────────────────────────────────

export const PROOF_FINAL_CTA = {
  id: "proof-cta",
  title: "우리 기관도 이렇게.",
  lead: INTRO_FINAL_CTA.lead,
  primary: { label: CONTACT.label, href: CONTACT.href, ctaId: "introduction_proof_final_contact" },
  secondary: { label: SHOWROOM.label, href: SHOWROOM.href, ctaId: "introduction_proof_final_showroom" },
  overview: { label: "클래스인 서비스 소개 보기", href: INTRO_PATH, ctaId: "introduction_proof_final_overview" },
  downloads: [INTRO_DOWNLOADS.introduction, INTRO_DOWNLOADS.smartClassroom] satisfies IntroDownload[],
  photo: photo("smart-lecture-1", "학생이 전자칠판 앞에서 판서하며 발표하는 수업"),
}
