/**
 * hardware/board-specs — Classin Board 공개 스펙표의 단일 진실원(SSOT).
 *
 * 원천은 《ClassIn Board 技术规格书》이며, 문서 정본은
 * `docs/active/classin-software-feature-inventory.md` §8 표다. 같은 값을 서술형으로
 * 풀어 쓴 곳이 `lib/docs.ts` 의 `board-lineup-specs` 문서이고, 이 모듈은 `/product/hw`
 * 스펙 표가 쓰는 구조화 버전이다. **세 곳이 같은 값을 말해야 한다.**
 *
 * 이 모듈이 생긴 이유: `/product/hw` 가 스펙을 페이지 안에 직접 들고 있어 규격서
 * 교정(2026-08)을 놓쳤고, 모델명 BS86A(정본 BS86C)와 S110 전체 길이 2,620.55mm
 * (정본 2,520.55mm — 규격서 오타로 교정 완료)가 공개 페이지에 그대로 남아 있었다.
 *
 * 값을 고칠 때는 문서 정본을 먼저 고치고 여기로 내린다.
 */

/** 스펙표에 노출하는 모델 키. 표의 열 순서와 같다(큰 화면부터). */
export const BOARD_SPEC_MODELS = ["s110", "s86", "s75", "s65"] as const

export type BoardSpecModel = (typeof BOARD_SPEC_MODELS)[number]

/** 모델별 값 한 줄. 값이 없거나 해당 없음이면 `"—"`. */
export type BoardSpecRow = { label: string } & Record<BoardSpecModel, string>

export interface BoardSpecGroup {
  category: string
  rows: BoardSpecRow[]
}

/**
 * 규격서 확보 여부. S65는 규격서를 확보하지 못해 표의 수치를 검증하지 못했다
 * (문서 정본 §8 주의 항목). 견적·제안서에 넣기 전 반드시 최신 규격서로 확인한다.
 */
export const BOARD_SPEC_VERIFIED: Record<BoardSpecModel, boolean> = {
  s110: true,
  s86: true,
  s75: true,
  s65: false,
}

/**
 * 규격서 기준 모델명. 스펙표와 `/product/hw` JSON-LD(`lib/seo.ts`)가 **같은 값을 써야 한다** —
 * JSON-LD 는 검색엔진이 읽는 면이라 여기서 갈라지면 잘못된 모델명이 색인된다.
 * 실제로 BS86A(정본 BS86C)가 양쪽에 각각 박혀 있었다.
 */
export const BOARD_MODEL_NAMES: Record<BoardSpecModel, string> = {
  s110: "BS110A",
  s86: "BS86C",
  s75: "BS75A",
  s65: "BS65A",
}

export const BOARD_SPEC_GROUPS: readonly BoardSpecGroup[] = [
  {
    category: "제품 사양",
    rows: [
      { label: "모델명", ...BOARD_MODEL_NAMES },
      { label: "화면 크기", s110: '110"', s86: '86"', s75: '75"', s65: '65"' },
      // 전체 크기는 가로 × 세로(높이) × 두께. 규격서 기준값이다.
      { label: "전체 길이", s110: "2,520.55mm", s86: "1,964.08mm", s75: "1,718.18mm", s65: "1,508.71mm" },
      { label: "전체 높이", s110: "1,457.20mm", s86: "1,139.02mm", s75: "1,000.20mm", s65: "889.87mm" },
      { label: "두께", s110: "110.00mm", s86: "113.10mm", s75: "113.10mm", s65: "94.79mm" },
      { label: "순중량", s110: "137kg", s86: "69.5kg", s75: "54kg", s65: "—" },
    ],
  },
  {
    category: "디스플레이",
    rows: [
      { label: "해상도", s110: "3840×2160", s86: "3840×2160", s75: "3840×2160", s65: "3840×2160" },
      { label: "주사율", s110: "120Hz", s86: "60Hz", s75: "60Hz", s65: "60Hz" },
      { label: "명암비", s110: "1200:1", s86: "4000:1", s75: "4000:1", s65: "—" },
      { label: "강화유리", s110: "4mm AG/AF", s86: "3mm AG/AF", s75: "3mm AG/AF", s65: "—" },
    ],
  },
  {
    category: "터치 방식",
    rows: [
      { label: "터치 포인트", s110: "50점", s86: "50점", s75: "50점", s65: "50점" },
      { label: "터치 기술", s110: "적외선 터치", s86: "적외선 터치", s75: "적외선 터치", s65: "적외선 터치" },
      { label: "응답 속도", s110: "2ms", s86: "2ms", s75: "2ms", s65: "2ms" },
      { label: "인식 범위", s110: "1.5mm", s86: "1.5mm", s75: "1.5mm", s65: "1.5mm" },
      // 제스처바는 규격서 표에 없는 항목이라 기존 페이지 표기를 유지한다.
      // 세대별로 달라질 수 있어 견적 전 최신 규격서로 확인한다(문서 정본 §8 주의).
      { label: "측면 제스처바", s110: "양측 제공", s86: "양측 제공", s75: "—", s65: "—" },
    ],
  },
  {
    category: "오디오",
    rows: [
      // S110은 "없음"이 아니라 규격서에 기재가 없다 — 단정하지 않고 확인으로 넘긴다.
      { label: "내장 마이크", s110: "별도 확인", s86: "8배열", s75: "8배열", s65: "8배열" },
      { label: "스피커 채널", s110: "2.0", s86: "2.0", s75: "2.0", s65: "2.0" },
      { label: "스피커 출력", s110: "2×15W", s86: "2×15W", s75: "2×15W", s65: "2×15W" },
    ],
  },
  {
    category: "부속품 (악세서리)",
    rows: [
      { label: "스탠드 (별도 옵션)", s110: "벽걸이 & 이동형", s86: "벽걸이 & 이동형", s75: "벽걸이 & 이동형", s65: "벽걸이 & 이동형" },
      { label: "OPS 컴퓨터 모듈", s110: "기본 제공", s86: "기본 제공", s75: "기본 제공", s65: "기본 제공" },
    ],
  },
] as const
