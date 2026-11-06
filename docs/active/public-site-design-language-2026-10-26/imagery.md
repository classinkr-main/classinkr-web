# 이미지·도식·데이터 시각화 (imagery) — 최종 스펙 v3

- **방향**: 편집 지면 · OS판 (Editorial Paper — OS Edition)
- **기준일**: 2026-10-26
- **반영 상태**: V10–V18 A 반영 2026-10-28([고급화 기획](../public-site-premium-elevation-2026-10-28.md), 운영자 승인). 이 문서에 닿는 것은 V10(홈 11지면)·V11(캡처 전 무도판 표지)·V14(도판 r0)·V15(지면·먹 값, 사진 흰점)·V16(캡처 매트)·V17(현상·모먼트 `--motion-slow` 900ms)과 결정 없이 채택된 출처 장부(X11·X10, IM-2)·도판 3계열(IM-1)·화면 도판 2종(IM-4)·제품 판(CO-7·IM-5)·HW 먹 장 한 컷(CO-8)·콘텐츠 폭 plate와 크기 3단(RA-5·IM-7)·여백 칸 캡션(TY-8)·현장 사진 보정(IM-6)·사람 표현(IM-8)·SW 포스터(IM-9)·도판 현상(MO-4)이다. 스펙은 목표 상태이고 구현 여부를 뜻하지 않는다.
- **범위**: 공개 셸 `.site` 안의 모든 도판이다. 홈, 제품(sw·hw·ai-report·/product), 소개, docs, 블로그, 행사, 동의 배너가 대상이고, 파일로는 `components/media`·`components/ui/figure.tsx`·`components/charts`·`components/diagrams`·`data/image-credits.json`·`public/images`·`public/video`가 들어간다.
- **제외**: /admin, /checkout, /receipt(`isInternalPath`)와 견적 문서면(`components/portal/quotes/**`). 정적 랜딩 `/l/*`는 백로그로 둔다. 단, `public/images` 미참조 정리 스캔에는 `public/l/*`(`app/l/[slug]/route.ts`가 서빙)와 `scripts/generate-segment-landings.mjs`의 참조를 반드시 포함한다. /checkout이 쓰는 이미지 4파일은 동결한다(§3-1).
- **정본 순서**: canonical C01–C28·X01–X16 > 시스템 기반 스펙(system) > 이 문서 > DESIGN.md. 이 스펙이 소유하는 canonical 행은 C05·C06·C09·C24·X06·X10·X11이다.
- **결정 표기**: 방향 결정은 V1–V9로, 고급화 기획 결정은 V10–V18로, 감사·모션 플랜 문서(`docs/active/public-site-audit-motion-plan-2026-10-26.md`) §4의 결정은 '감사 D#'로 적는다. V1–V9는 2026-10-27에 A로 확정됐다(이 문서에 닿는 것: V3-A, V4-A, V5-A, V6 1.5px(DPR1 2px), V7-A). V10–V18은 2026-10-28에 전부 A로 승인됐다.
- **단계 표기**: H(정직성 핫픽스, P2 전) → P2-0(결정 기록) → P2 → P3 → P4 → P5. H는 디자인 브랜치와 별개로 main에서 진행하고, 이 문서는 로드맵에 기록만 한다.
- **절 번호 대응**: gap_triage와 다른 스펙이 가리키는 'imagery §3-8 차트', '§3-9 영상 대체물', '§3-11 선화'는 이 문서의 **§3-10 차트**, **§3-11 영상과 포스터**, **§3-13 선화·빈 상태**다(§3-8은 주석, §3-9는 펜 도해). '§3-4 사진 확보'는 같다. 대체 소재 절의 하위 항목은 §3-6a(재캡처)·§3-6b(촬영)로 적는다.

---

## 요약

사진, 화면, 도해, 차트는 교육 전문지의 **도판**이다. 장식이 아니라 증거로 쓴다. 모든 도판의 정직 라벨은 출처 장부 `data/image-credits.json`에서 나오고, Figure/Frame은 장부 `id` 하나만 받는다. 도판은 현장·사물·화면 3계열의 한 빛으로 맞추고, CSS 그림자·필터·그라데이션은 쓰지 않으며, 반경은 0이다. 움직임은 decode 전 도판의 opacity 현상과 페이지당 차트 1개의 opacity 순차 등장뿐이다. 출처를 밝힐 수 없는 도판은 라벨을 짐작해 달지 않고 싣지 않는다.

**한 줄 규칙**
- **라벨 6종**(X11): 실제 사진 `사진 · {제공처}` / 연출 촬영 `예시 연출` / 생성 `AI 생성 이미지` / 렌더 `제품 렌더` / 실제 화면 `실제 화면 · YYYY.MM 캡처` / 목업은 Frame 안 점선 태그 `예시 화면`. 라벨은 장부 행에서 파생하고 새 종류는 만들지 않는다(고급화 2026-10-28).
- **Frame**(C05·X05·X10): 제목줄·창틀·그림자 없이 sheet + 1px hair + r0. 40rem 이상에서는 sunken 매트(20px, 64rem 이상 32px) 안에 놓고, 40rem 미만은 매트 없이 전폭이다(V16-A · 2026-10-28). 캡션 문법은 모든 도판이 같고, 목업만 캡션 대신 점선 태그를 단다.
- **차트**(C06): 서버 SVG로 그리고 JS는 0이다. 공개 사이트의 Recharts import는 0. 등장은 `[data-seq]` opacity 순차(`--motion-slow`, 레이어 간격 `--motion-beat`)이고 stroke-dashoffset은 사이트 전체에서 0이다.
- **Hero**(V3-A·V11-A·C09): 출처를 확인한 EDB 판서 capture가 커밋되기 전까지 Hero 안 Figure/Frame은 0이다(무도판 비대칭 표지). 캡처가 커밋되면 오른쪽 5칸에 capture Frame을 둔다(V3-A 7/5). 같은 이미지 파일은 페이지당 1회다. 홈 영상은 없고, LCP 요소는 H1이다.
- **크기**(RA-5·IM-7): 풀블리드는 폐기한다. 큰 도판은 콘텐츠 폭 plate(L)이고 크기는 L·M·S 3단이다. 콘텐츠 이미지의 `sizes="100vw"`는 0이다.
- **선 굵기**(C11·V6): `--stroke-pen` 1.5px(DPR1에서 2px)와 `--stroke-accent` 2px 두 개뿐이다. 정보선 색은 `--line-control` #8A857F(C23, V15-A)다.
- **번호**(C24): 한 페이지 번호 체계는 2종 이하다. 홈 도판에는 번호가 없다. 주석 마커는 a·b다.

**저장소에서 확인한 현황**(HEAD 기준. [코드]는 코드에서 읽은 것, [측정]은 sips·ffprobe·계산으로 잰 것, [지식]은 확인하지 않은 일반 지식)

| # | 현상 | 근거 |
|---|---|---|
| 1 | 홈 Hero 하단 도판이 어두운 교실 속 파란 지구 그림(`hero-dashboard.webp`)이다. alt는 "Classin Education Dashboard"로 내용과 다르다. 같은 파일이 히어로 영상의 포스터다. | [코드] `Hero.tsx:22,107` |
| 2 | 영상 5개(§3-11 표). 루프 3개에 쓸모없는 aac 트랙이 있고, 클립2는 색 태그가 unknown이다. 브랜드 필름은 무음 72초 자동재생 루프인데 정지 수단이 없다. `<video poster>`가 포스터를 한 번 더 받는다. | [측정] ffprobe |
| 3 | `unoptimized` 3곳. docs는 로컬 이미지 전부가 원본으로 나간다(cs-figma PNG 최대 9.1MB). | [코드] `app/docs/_utils.tsx:168`, `CaseStudies.tsx:162`, `sw/page.tsx:1908` |
| 4 | `sizes` 없는 `fill` 3곳(ScienceBased 2, BigBackdropImage 1). 숨김 컨테이너 안 `priority` 1곳(Hero). Header 로고 `priority`가 모든 라우트에 걸려 있다. Next 16.2.4에서 `priority`는 deprecated(→`preload`)이고 둘을 같이 쓰면 throw한다. | [코드] `Header.tsx:69`, `Hero.tsx:19-29`, `get-img-props.d.ts:25` |
| 5 | docs 도해 SVG 4종은 viewBox 1440, 글자 22/28px다. 343px 폭에서 5.2/6.7px로 렌더된다. 3px `#31302E` 선에 채운 화살촉이 있고, `<img>` SVG라 웹폰트를 못 쓴다. | [코드]·[측정] |
| 6 | DashboardPreview는 `'use client'` + `dynamic(ssr:false)` Recharts로 그린다. 그라데이션, 가공 '지역 평균' 선, 50부터 시작하는 Y축, 남보라 blur 툴팁이 있고 '예시' 표기가 없다. JS가 없으면 빈다. | [코드] |
| 7 | 사례 사진 원본: busan 2.22, cheonan·daechi 1.78, daegu 1.50, online-12inedu 1.78(사진이 아니라 바둑 활동 **화면 캡처**, 참가자는 블러), pyeongtaek 0.80, cheongju 0.75. 176px 슬롯에 cover로 잘린다. 본문은 익명인데 파일명은 실명이다. | [측정] sips |
| 8 | 생성·스톡 이미지가 섞여 있다: KeyUseCases 오버레이(무지개 칩·클레이 3D), `feature-writing.webp`(중국어 EEO 포스터), SW 서양 스톡, About 스톡 6장, HW 공간 사진(생성으로 보임[추정]). KeyUseCases `*-source.png` 4장은 실제 Classin 캡처로 보이지만, 장부에서 실제 캡처로 확인하기 전에는 쓰지 않는다(IM-4). | [측정] |
| 9 | `admin-dashboard-source-2.webp`의 휴대폰 번호·닉네임이 블러로만 가려져 있다. | [측정] |
| 10 | 미참조 이미지 65개, 약 25.9MB(HW 18개, 21.4MB). `/l/online` GIF 9.5MB, `/l/kids` PNG 약 20MB. | [측정] |
| 11 | `/images/*`·`/video/*`는 1년 immutable 캐시라 같은 이름으로 덮어쓰면 갱신되지 않는다. | [코드] `next.config.ts` |
| 12 | ai-report: `#ECFDF5` 면, 10px `#A39E98` 라벨, `repeat: Infinity` 점멸·웨이브폼. | [코드] `ai-report/page.tsx:472,589,600,662` |
| 13 | (2026-10-28 사실 확인) 렌더되는 HW 이미지 21개 중 5개가 `scripts/generate-hw-images.ts` 출력과 파일명이 같고(git 기록상 3개는 Gemini 생성), 16개는 출처 기록이 없다. | [코드] |
| 14 | (2026-10-28) About 스톡은 6장(culture 3 + partnership 3)이다. 커밋 `cd9803d2`가 이들을 classin.com 공식 사진(사용 허락)으로 기록한다. | [코드] |
| 15 | (2026-10-28) SW 히어로 영상은 이미 쿼드러닝 수업 클립(1080p)이다. 스톡은 포스터뿐이고 페이지에 두 번 쓰인다. | [코드] |
| 16 | (2026-10-28) /checkout이 쓰는 이미지 4파일(`lib/billing/hardware-catalog.ts:109,122,134,148`: `space-s75-seminar`·`space-s86-classroom`·`camera-dual-premium-blended`·`hero-board-stand`). 그중 `space-s75`·`space-s86`은 생성 스크립트 출력명과 같다. | [코드] |
| 17 | (2026-10-28) 풀블리드 도판은 HW `BigBackdrop`과 `FullWidthPointSection`(`hw/page.tsx:497-507`, `sizes="100vw"`) 두 곳이다. | [코드] |
| 18 | (2026-10-28) 정적 랜딩 `public/l/*`와 `scripts/generate-segment-landings.mjs`(:2280,2354,2418)가 `admin-dashboard-source-2`(휴대폰 번호·닉네임 블러만, IP 노출)를 참조한다. 블러만 된 `admin-dashboard-source-1`은 홈·SW에 있다. | [코드] |

---

## 1. 원칙

1. **도판은 증거다.** 장식 사진, 수치 옆 장식, 먹 지면 위 사진·Frame은 쓰지 않는다. 사례에는 동의받은 실제 사진, 제품에는 실사나 제품 렌더, 기능에는 실제 화면 Frame, 구조에는 펜 도해, 수치에는 서버 차트(출처가 있거나 '예시')를 쓴다.
2. **모든 도판에 정직 라벨을 단다**(X11). 라벨은 출처 장부 `data/image-credits.json`의 행에서 파생하고, Figure/Frame은 장부 `id` 하나만 받으므로 빠뜨릴 수 없다(§3-1). 근거 없는 수치나 출처를 밝힐 수 없는 이미지는 싣지 않는다. 출처가 확인되지 않은 도판에는 어떤 라벨도 짐작해 달지 않는다('출처 확인 중' 같은 새 라벨 종류도 만들지 않는다). ○●–는 상태 표시 전용이고 '예시'를 뜻하지 않는다.
3. **예시 데이터에는 결론을 붙이지 않는다.** 목업 차트 제목은 서술형으로 쓰고, 컴포넌트가 **캡션** 끝에 `· 예시`를 붙인다(제목에는 붙이지 않는다). 발견형 제목은 출처 있는 실데이터에만 쓴다.
4. **형태는 지면과 같다.** 도판(Figure·Frame·plate·매트)은 r0이다. 반경은 누를 수 있는 것에만 쓰고, 공개 사이트의 반경 값은 0·6·원형 셋뿐이다(V14-A · 2026-10-28). 테두리는 1px hair다. CSS 그림자, 필터, blend, hover 확대, 회전, 패럴랙스는 0이다(X05). 예외는 '제품 렌더' 자산 안에 구운 접지 그림자 1개뿐이고, 이것은 CSS가 아니라 이미지 내용이다(§3-5·§10). 스크림은 영상·사진 위에 큰 글자가 있을 때만 `bg-surface-scrim` 한 겹을 쓴다.
5. **톤은 에셋 단계에서 굽는다.** 런타임 CSS filter는 쓰지 않는다. 실제 캡처와 제품 화면 속 색은 원본 그대로 두고 리컬러하지 않는다.
6. **도해는 펜 선으로 그린다.** 정보선은 `--stroke-pen` `--line-control`, 강조는 도해당 1경로 `--stroke-accent` `--fg-accent`다. 화살촉 대신 단자 점을 쓰고, 글자는 Pretendard로 렌더 13px 이상이다.
7. **차트는 한 가지만 말한다.** 강조 1계열과 비교 1계열을 두고, 범례 대신 끝값을 넣은 직접 라벨을 단다. 면 채움 0, 서버 렌더 JS 0이다. 등장은 페이지당 1개의 opacity 순차다.
8. **출처 없는 도판은 대체를 기다리지 않는다.** 홈 Hero의 출처 미확인 도판은 캡처가 오기 전에 내리고 무도판 표지로 둔다(V11-A · 2026-10-28). 그 밖의 기존 미검증 도판은 라우트 PR마다 교체하거나 텍스트로 대체한다(래칫, §3-1). 대체가 오기 전에 빈 Frame을 두지 않고, 텍스트 단·사양표·도해로 무게를 유지한다(IM-1).
9. **SSR·JS 없음·reduced에서는 항상 완성 상태다.** 무장은 `site-base.css`의 no-preference 블록 하나에서만 한다(X07).
10. **도판은 3계열, 한 빛이다**(IM-1, P2 문서 → P4 적용). 모든 공개 도판은 아래 셋 중 하나이고, 장부 `family`에 계열을 적는다. 공개 지면 도판의 평균 휘도는 100/255 이상이다. 예외는 HW 먹 장의 OPS 컷아웃 1장뿐이다(CO-8).

    | 계열 | 라벨 종류 | 빛 | 구도·비율 | 그레이드 |
    |---|---|---|---|---|
    | 현장 | photo · staged | 3600–3800K 단일 색온도(형광등은 끄거나 같은 색온도로 맞춘다) | 눈높이 1.2–1.4m, 35–50mm 환산, 3:2 마스터. 사람은 뒷모습·측면·손, 보드에는 한국어 판서 | 사진별 중립 패치 WB → 공통 그레이드, 흰점 = paper(§3-5) |
    | 사물 | render · 제품 실사 | 좌상 키 라이트 하나 | 16:10 무봉 판 1색(sunken 값), 구운 접지 그림자 1개, 정면 또는 3/4(CO-7) | 판 합성(§3-5) |
    | 화면 | capture · mock | 라이트 테마 | 16:10. 전체 1920×1200 또는 영역 1440×900(IM-4). 창틀·커서·알림·딤 0 | 원본 색 그대로 |

    금지 컷: 보드 화면 속 우주·자연 배경화면, 시네마틱 다크 키, 네온·유리 제품 컷.
11. **사람은 진짜만, 적게 싣는다**(IM-8). 식별 가능한 얼굴은 페이지당 1개 이하이고, 장부 `consentDocId`가 필수다. 이니셜 원 아바타와 스톡 인물은 쓰지 않는다. 학생은 얼굴 0(뒷모습·손)이고 블러도 0이다.

---

## 2. 토큰 (CSS + Tailwind @theme)

**색 토큰은 새로 만들지 않는다.** X01의 20색 중 아래만 참조하고, fallback이 있는 `var()`는 쓰지 않는다. 먹 지면 전환은 `tokens.css`의 `.surface-ink` 한 곳(C01)이 맡으므로, 이 스펙은 `.surface-ink` 블록을 따로 두지 않는다.

| 참조 토큰 | 이 스펙에서의 용도 | Tailwind 유틸(C02) |
|---|---|---|
| `--surface-paper` #F9F8F5 | 사진 흰점(§3-5 그레이딩 목표), 영상 출력 흰점 | `bg-surface-paper` |
| `--surface-sheet` #FFFFFF | Frame 바탕, 점선 태그 바탕, 주석 마커, sunken 섹션 위 매트 | `bg-surface-sheet` |
| `--surface-sunken` #F3F2EE | 캡처 매트(V16-A), 제품 밝은 판 색(CO-7) | `bg-surface-sunken` |
| `--surface-skeleton` #EFEEE9 | 이미지 자리표시(정보선 금지 면), 캡처 개인정보 단색 마스킹 | `bg-surface-skeleton` |
| `--surface-ink` #1A1917 | HW 먹 장 OPS 컷아웃의 판 색(CO-8). 이 스펙은 먹 지면을 만들지 않는다 | — |
| `--surface-scrim` rgb(17 17 16/.48) | 영상·사진 위 큰 글자 스크림(1겹) | `bg-surface-scrim` |
| `--line-hair` .08 | 캡션 괘선, Frame 테두리, fig-edge, 차트 기준선, 도해 열 머리 아래선, KpiSpark 윗선(장식선) | `border-line-hair` |
| `--line-control` #8A857F | 도해 정보선·노드 윤곽, 차트 비교선·비교 막대, ○, 점선 태그·리더선, 영상 정지 버튼 테두리(line 변형) | `border-line-control` |
| `--fg-ink / body / muted` | 도판 안 글자(muted 이상만), 여백 칸 캡션 출처 라벨(ink) | `text-fg-*` |
| `--fg-accent` #084734 | 강조선·강조 막대·단자·버스·주석 점 | `text-fg-accent` |
| `--stroke-pen` 1.5px / DPR1 2px | 정보선·비교선 굵기(C11) | — |
| `--stroke-accent` 2px | 강조선·버스 굵기(C11) | — |
| `--motion-slow` 900ms · `--ease-fade` cubic-bezier(.33,1,.68,1) | 차트 레이어 등장, 도판 현상(MO-4), 배경 루프 영상 페이드(V17-A · 2026-10-28) | — |
| `--motion-beat` 240ms | 차트 레이어 순차 간격(`calc(var(--seq, 0) * var(--motion-beat))`) | — |
| `--motion-base` 320ms · `--ease-soft` | 사례 캐러셀 이동(4건 이상 목록 지면) | — |
| `--motion-stagger` 80ms | OS 지도 ○→● 노드 간격(cards_motion 소유) | — |
| `--focus-offset` 2px | 영상 정지 버튼 포커스 링 간격(MO-5) | — |

지면 값은 V15-A(2026-10-28)다: paper #F9F8F5 · sunken #F3F2EE · skeleton #EFEEE9 · line-control #8A857F · surface-ink #1A1917. 글자 #111110은 그대로다.

**이 스펙이 소유하는 토큰은 비율 3개뿐이다.** `--dg-line-w`, `--dg-accent-w`, `--chart-*-w`, `--chart-h*`, `--chart-dot`, `--dg-corner`, `--dg-terminal`, `--fig-scrim*`는 만들지 않는다(C11·X13). 크기는 Tailwind 스케일로 쓰고, 굵기는 `--stroke-*` 두 개로 쓴다.

```css
/* ===== app/styles/tokens.css — @theme inline 안 (imagery 소유: 비율 3) ===== */
@theme inline {
  --aspect-case: 3 / 2;        /* aspect-case     사례·현장 사진 (16:9 원본 크롭 15.6%) */
  --aspect-screen: 16 / 10;    /* aspect-screen   화면 캡처·제품·Frame */
  --aspect-portrait: 4 / 5;    /* aspect-portrait 인물·초상 */
  /* aspect-video(16/9)는 Tailwind 기본값을 쓴다 */
}
/* DPR1 보정(--stroke-pen 2px)과 prefers-contrast 재정의는 tokens.css :root 블록(system 소유)에 이미 있다 */
```

```css
/* ===== app/styles/utilities.css — @utility (imagery 소유: fig-edge, chart-stroke) =====
   유틸에는 정적인 모양만 두고 transform·opacity·animation은 선언하지 않는다 */
@utility fig-edge {                 /* 사진 위에 겹치는 1px 가장자리. position:relative는 Figure 래퍼가 건다 */
  &::after {
    content: ""; position: absolute; inset: 0; z-index: 1;
    border: 1px solid var(--line-hair); border-radius: inherit; pointer-events: none;
  }
}
@utility chart-stroke {             /* 늘어나는 차트 SVG(preserveAspectRatio="none")의 데이터 선 */
  fill: none; vector-effect: non-scaling-stroke;
  stroke-linecap: round; stroke-linejoin: round;
}
```

```css
/* ===== app/styles/site-base.css — @layer components (imagery 소유분) =====
   모든 셀렉터는 :where(.site)로 시작한다(특이도 0) */
@layer components {
  /* 차트 계열: 클래스로 둬야 forced-colors가 덮을 수 있다 */
  :where(.site) .chart-accent  { stroke: var(--fg-accent);    stroke-width: var(--stroke-accent); }
  :where(.site) .chart-compare { stroke: var(--line-control); stroke-width: var(--stroke-pen); }

  /* 펜 도해: path·line은 선, rect 노드 윤곽은 dg-box(정보선과 같은 값, C11·C23), circle은 단자 점(채움).
     --line-strong은 장식선 전용(C23 닫힌 목록)이라 도해에 쓰지 않는다. 굵기는 --stroke-* 두 토큰뿐이다 */
  :where(.site) :is(.dg-line, .dg-box) { fill: none; stroke: var(--line-control); stroke-width: var(--stroke-pen);   vector-effect: non-scaling-stroke; }
  :where(.site) .dg-accent { fill: none; stroke: var(--fg-accent);    stroke-width: var(--stroke-accent); vector-effect: non-scaling-stroke; }
  :where(.site) circle.dg-line   { fill: var(--line-control); stroke: none; }
  :where(.site) circle.dg-accent { fill: var(--fg-accent);    stroke: none; }

  /* 차트 레이어 박자(C06, 값 소유 imagery). 전이 규칙은 cards_motion §3-14 ④ 한 곳이 이 --seq를 읽는다 */
  :where(.site) [data-seq="1"] { --seq: 1; }
  :where(.site) [data-seq="2"] { --seq: 2; }

  /* 사례 캐러셀 상태(X06). 사례 4건 이상인 목록 지면에서만 쓴다(홈은 정적 3건). 이동 전이는 아래 no-preference 블록에서만 */
  :where(.site) .case-slide[data-pos="near"] { opacity: .72; }
  :where(.site) .case-slide[data-pos="near"] .case-body { opacity: 0; }
  :where(.site) .case-slide[data-pos="far"]  { opacity: 0; pointer-events: none; }

  /* 영상 정지 버튼 포커스는 전역 보증 ①(outline 2px var(--fg-accent), offset var(--focus-offset)) 하나다. 별도 규칙·box-shadow 없음(X05) */

  @media (forced-colors: active) {
    :where(.site) :is(.chart-accent, .dg-accent) { stroke: Highlight; }
    :where(.site) .chart-compare { stroke: GrayText; }
    :where(.site) :is(.dg-line, .dg-box) { stroke: CanvasText; }
    :where(.site) circle.dg-accent { fill: Highlight; }
    :where(.site) circle.dg-line { fill: CanvasText; }
  }

  /* ↓ 아래 규칙은 site-base.css components의 단일 no-preference 블록에 합친다(X07). 따로 블록을 만들지 않는다 */
  @media (prefers-reduced-motion: no-preference) {
    /* 차트 등장(C06): <Reveal bare threshold={0.4}> 안에서만 무장. 비교(0) → 강조(1) → 끝점·라벨(2).
       [data-seq] 무장·전이 규칙은 cards_motion §3-14 ④ 한 곳에 있다(opacity var(--motion-slow) var(--ease-fade),
       지연 calc(var(--seq, 0) * var(--motion-beat))). 여기에 다시 쓰지 않는다 */

    /* 사례 캐러셀(X06): 4건 이상 목록 지면의 수동 넘김 이동만, scale 0 */
    :where(.site) .case-slide { transition: transform var(--motion-base) var(--ease-soft), opacity var(--motion-base) var(--ease-soft); }
    :where(.site) .case-body  { transition: opacity var(--motion-base) var(--ease-soft); }

    /* 도판 현상(MO-4): decode 전 도판만. AppChrome 공개 분기의 클라이언트 효과 1개가 마운트 뒤
       Figure·Frame 안 img와 블로그 본문 img 중 img.complete === false인 것에만 data-loading을 달고, decode가 끝나면 data-loaded로 바꾼다.
       액자(fig-edge·매트·테두리)·캡션·출처 라벨은 처음부터 보인다. 캐시된 도판은 페이드 0. scale·clip-path·mask·와이프 0 */
    :where(.site) img[data-loading] { opacity: 0; }
    :where(.site) img[data-loaded] { opacity: 1; transition: opacity var(--motion-slow) var(--ease-fade); }

    /* 제품 페이지 배경 루프 영상: 포스터 위 페이드인 */
    :where(.site) video[data-loop][data-ready="false"] { opacity: 0; }
    :where(.site) video[data-loop][data-ready="true"]  { opacity: 1; transition: opacity var(--motion-slow) var(--ease-fade); }
  }
}
```

- 이 블록에 ms 리터럴은 없다. `[data-seq]` 레이어 박자(0·1·2)는 이 스펙이, 시간(`--motion-slow` 900ms, 간격 `--motion-beat` 240ms)과 전이 규칙은 cards_motion §3-14 ④가 정한다(V17-A · 2026-10-28).
- `--line-control`의 먹 위 값(/.40)과 `--fg-accent`의 먹 위 값(세이지 #8FC4AC, CO-3)은 C01 블록이 정의한다. 먹 면이 #1A1917로 바뀌므로(V15-A) 먹 위 대비는 `tests/design/surface-contrast.test.ts`에서 다시 잰다.

---

## 3. 패턴과 값 (데스크톱 / 모바일)

브레이크포인트는 X02를 따른다. 모바일은 `(width < 40rem)`, 태블릿은 `sm`–`lg` 미만, 데스크톱은 `lg`(64rem) 이상이다. HTML 속성(`sizes`, `<source media>`, `<link media>`)은 CSS가 아니므로 `min-width` 표기를 그대로 쓴다.

### 3-1. 출처 장부와 라벨 (X11·X10, 소유)

라벨은 호출부가 선언하지 않는다. 사실 기록인 출처 장부 `data/image-credits.json`(P2 신설, IM-2)에서 만든다. Figure/Frame은 장부 `id` 하나로 파일·라벨·출처를 찾는다(src·source prop은 없다). 라벨 종류는 6종 그대로다(고급화 2026-10-28).

```ts
// data/image-credits.json의 행. 장부가 라벨·출처의 정본이다. kind별 필드(credit·date·screen·summary)는 FigureSource가 정한다
type ImageCredit = FigureSource & {
  id: string                    // Figure/Frame이 받는 값
  file?: string                 // public 경로. kind "mock" 행에는 없다(코드 목업은 Frame children으로 그린다, 2026-10-28)
  family: "현장" | "사물" | "화면"   // §1 원칙 10
  origin: string                // 제작자·계약·원본 경로 등 출처 근거. mock은 목업 컴포넌트 경로
  consentDocId?: string         // 식별 가능한 얼굴·실명 사례면 필수(§1 원칙 11)
  neutralPatch?: [number, number, number, number]   // §3-5 중립 패치 WB [x, y, w, h]
  verifiedAt?: string           // 출처 확인일. 없는 새 도판은 빌드 실패
  frozenBy?: "checkout"         // 삭제·덮어쓰기 금지
}

// components/ui/figure.tsx — 서버 컴포넌트(훅 없음). Figure·Frame·Annotation을 내보낸다(X10). 라벨은 장부 행에서 만든다
export type FigureSource =
  | { kind: "photo"; credit: string }                // '사진 · {credit}' — credit 필수, '○○' 금지(가드)
  | { kind: "staged" }                               // '예시 연출' — 실제로 연출해 촬영한 컷만
  | { kind: "generated" }                            // 'AI 생성 이미지' — 분위기 컷만. 제품·UI·식별 얼굴·plate 금지
  | { kind: "render"; screen?: `${number}.${number}` } // '제품 렌더' — 실제 제품의 사실적 렌더만. screen은 화면 합성 캡처 월
  | { kind: "capture"; date: `${number}.${number}` } // '실제 화면 · 2026.11 캡처'
  | { kind: "mock"; summary: string }                // Frame 안 점선 태그 '예시 화면' + sr-only '예시 화면: {summary}'

export function sourceLabel(s: FigureSource): string | null {
  switch (s.kind) {
    case "photo": return `사진 · ${s.credit}`
    case "staged": return "예시 연출"
    case "generated": return "AI 생성 이미지"
    case "render": return "제품 렌더"   // screen이 있으면 캡션 왼쪽에 '화면: 실제 화면 · {screen} 캡처'를 더한다. 라벨은 하나다
    case "capture": return `실제 화면 · ${s.date} 캡처`
    case "mock": return null   // 캡션이 아니라 Frame 안 태그로 표시한다
  }
}
```

| 종류 | 쓰는 곳 | 금지 |
|---|---|---|
| photo | 동의받은 사례·현장·제품 실사 | 출처 미상, 자리표시 '○○', 블러 마스킹 |
| staged | 실제 연출 촬영분(3-6b) | 생성 이미지에 붙이기 |
| generated | 분위기 컷 | 제품(보드·OPS·카메라), Classin UI, 식별 가능한 얼굴, 고객·성과·실제 교실 대체, 주석, plate, Hero |
| render | 출처를 확인한 실제 제품 렌더(제조사 원본 렌더·CAD 재조명) | 가상 화면, 분해 3D, 글로우, 색 후광·림 라이트·반사 바닥(분해도는 펜 도해로). 출처 미확인 렌더 |
| capture | 마스킹을 마친 실데이터·테스트 계정 화면 | 리컬러·필터, 블러 마스킹 |
| mock | 코드 목업 | 실데이터처럼 보이는 결론형 제목, 주석 |

- 테스트 데이터가 보이는 capture는 캡션 왼쪽에 `화면 속 데이터는 테스트용`을 덧붙인다.
- 'AI 생성 이미지' 라벨은 '예시 연출'과 함께 쓰지 않는다. 라벨은 하나만 단다.
- **출처 미확인 도판에는 라벨을 짐작해 달지 않는다.** 출처가 확인되지 않으면 장부 `verifiedAt`이 비어 있다. 새 도판이면 싣지 않고, 기존 도판은 그 라우트 PR에서 검증하거나 교체한다. 어느 경우에도 'AI 생성'으로도 '사진'으로도 단정하지 않는다.

**빌드 가드(래칫, P2)**
- 장부에 없거나 `verifiedAt`이 없는 **새** 도판은 빌드를 실패시킨다.
- 기존 미검증 도판은 라우트 PR마다 교체하거나 텍스트로 대체해 줄인다(래칫). 대체 전에 빈 Frame을 두지 않는다.
- 1차 검증 대상(지금 공개 참조, 출처 미확인): `hero-dashboard`·`writing-*`·`space-*`·`camera-*`·`culture/*`·ScienceBased 초상. 근거 자료는 git 이력(`8457e751`)과 `scripts/generate-hw-images.ts`의 출력 파일명 목록이다. 이름이 같다는 이유만으로 라벨을 짐작해 달지 않는다. 검증 담당자는 P2-0에서 지정한다.
- About 스톡 6장(culture 3 + partnership 3)은 장부 `origin`에 커밋 `cd9803d2`의 기록(classin.com 공식 사진, 사용 허락)을 근거로 적는다.
- **/checkout 동결**: `lib/billing/hardware-catalog.ts:109,122,134,148`이 쓰는 4파일(`space-s75-seminar`·`space-s86-classroom`·`camera-dual-premium-blended`·`hero-board-stand`)은 H에서 파일 존재·해시 테스트로 막고(스크린샷 게이트로는 못 지킨다), P2 장부에서 `frozenBy: "checkout"`으로 삭제·덮어쓰기를 막는다. 그중 `space-s75`·`space-s86`은 생성 스크립트 출력명과 같으므로 라벨·교체는 운영자가 정한다(결제 화면은 디자인 범위 밖). 공개 페이지에서는 장부 검증 전까지 이 4파일을 쓰지 않는다.

### 3-2. 캡션 문법과 번호 (C05·C24, 소유)

| 속성 | 데스크톱 | 모바일 |
|---|---|---|
| 위치 | 도판 아래 12px → 1px `--line-hair` → 8px (`mt-3 border-t border-line-hair pt-2`). 매트가 있으면 매트 바깥 아래 | 같음 |
| 여백 칸 캡션(TY-8) | 64rem 이상에서 12칸 전폭이 아닌 도판은 캡션을 여백 칸(10–12)에 아래 맞춤(`self-end`)으로 둔다: 1px hair → 설명 13/400 `--fg-muted`(60자 이하) → 출처 라벨 13/500 `--fg-ink`. 제품 장(P4)과 /about에만 쓰고 홈은 대상이 아니다. 전폭 도판과 그 밖의 경우는 도판 아래 | 도판 아래 |
| 글자 | `text-note text-fg-muted tabular-nums`(13/400/1.5). line-clamp 금지(확대하면 잘림), 2줄은 작성 가이드로만 | 같음 |
| 배치 | `flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1`. 왼쪽에 `[그림 n · ]{장면}, {연도}`, 오른쪽에 라벨(`whitespace-nowrap`) | 폭이 모자라면 라벨이 아래 줄로 내려간다 |
| mock | **캡션을 달지 않는다.** Frame 안 오른쪽 위 점선 태그 `예시 화면`이 캡션을 대신한다(C05). 장면 설명은 sr-only 요약(`예시 화면: {summary}`, summary는 장부 mock 행)이 맡는다 | 같음 |
| Frame 밖 예시 수치 묶음 | 묶음 바로 아래 캡션 `수치는 예시입니다` 1회 | 같음 |

**캡션 예**
- 장문 페이지: `그림 3 · 대구 정규반 판서 수업, 2025` / `사진 · 학원 제공`
- 홈 Hero(캡처 커밋 뒤): `EDB 판서 화면` / `실제 화면 · 2026.11 캡처`
- 화면 합성 제품 렌더: `화면: 실제 화면 · 2026.11 캡처` / `제품 렌더`

**번호 규칙**(C24)
- 한 페이지의 숫자 번호 체계는 2종 이하다. 후보는 Act 폴리오, 'No. 01', 그림 n, 표 n, 각주 n, 목록 페이지의 TocRow 폴리오다.
- '그림 n'은 도판이 3개 이상인 장문 페이지(블로그 글, docs 글, 제품 장문)에만 쓴다. 홈과 탭·캐러셀 안 도판에는 번호를 달지 않는다.
- 홈은 Act 폴리오와 'No. 01'만 쓴다. 그래서 홈 도판·도해(수업 OS 지도 포함)에는 숫자 번호가 0이다.
- 주석 마커는 숫자가 아니라 a·b다(`<ol type="a">`, capture Frame 전용). ①②는 쓰지 않는다.
- 각주 번호는 한 섹션에 출처 있는 수치가 3개 이상일 때만 쓴다.

### 3-3. Figure: 사진 도판

```tsx
type FigureProps = {
  id: ImageId                  // data/image-credits.json 행 id. 파일·라벨·출처는 장부에서 나온다(src·source prop 없음)
  ratio: "case" | "screen" | "portrait" | "video" | "plate"   // plate = 크기 L(§3-4)
  size: "L" | "M" | "S"        // 크기 3단(§3-4). data-plate로 출력해 가드 예산이 센다
  caption?: ReactNode          // 장면 설명(왼쪽)
  captionPlacement?: "below" | "margin"   // TY-8. margin은 64rem 이상에서 12칸 전폭이 아닌 도판만
  folio?: number               // '그림 n'. 도판이 3개 이상인 장문 페이지에서만 넘긴다
  inCard?: boolean             // 카드 안이면 카드가 테두리를 맡는다(fig-edge 생략)
}
// <figure data-figure={kind} data-plate={size}> 래퍼: relative isolate overflow-hidden bg-surface-skeleton aspect-{ratio} fig-edge
// Figure가 장부 file로 next/image를 직접 렌더한다(fill + §6 sizes)
```

| 속성 | 데스크톱 | 모바일 |
|---|---|---|
| 래퍼 | `relative isolate overflow-hidden bg-surface-skeleton aspect-{ratio}` | 같음 |
| 반경 | r0. 도판에 `rounded-*`를 쓰지 않는다(V14-A · 2026-10-28, 반경 가드는 허용목록 방식). 카드도 r0이다 | 같음 |
| 테두리 | `fig-edge`(::after 1px `--line-hair`). 카드 안에서는 생략 | 같음 |
| 그림자·필터·hover | CSS 0. '제품 렌더' 자산 안의 구운 접지 그림자 1개만 이미지 내용으로 허용(§3-5) | 같음 |
| 자리표시 | `bg-surface-skeleton` 단색. blur placeholder는 없다. decode 전 도판만 opacity로 현상한다(`--motion-slow` `--ease-fade`, MO-4). 액자·캡션·출처 라벨은 즉시 보이고, 캐시된 도판은 페이드 0이다. scale·clip-path·mask·와이프는 금지한다 | 같음 |
| next/image | `fill` + `sizes` 필수(§6 표준 문자열). 콘텐츠 이미지에 `sizes="100vw"`는 0. `priority`는 쓰지 않는다(Next 16 deprecated) | 같음 |
| 반복 | 같은 이미지 파일은 페이지당 1회(배경·포스터 포함, C09) | 같음 |

### 3-4. 비율·크롭·사진 확보 (X06 비율, gap: 사진 확보·권리 파이프라인)

| 용도 | 비율 | 클래스 | 마스터(긴 변) |
|---|---|---|---|
| 사례·현장 카드 | **3:2** | `aspect-case` | 1600×1067 |
| 화면·제품·Frame | 16:10 | `aspect-screen` | 1920×1200. 크롭하지 않고 16:10 창으로 **다시 캡처**한다 |
| 인물·초상 | 4:5 | `aspect-portrait` | 1080×1350. 인용 옆 초상은 120×150(모바일 96×120), 마스터 600×750. 식별 얼굴은 페이지당 1개 이하, `consentDocId` 필수(IM-8) |
| 영상 | 16:9 | `aspect-video` | 1280×720 |
| plate(크기 L) | 데스크톱 16:9, 모바일 4:5 | `ratio="plate"` | `getImageProps` + `<picture>`로 2컷 아트 디렉션. 전달 AVIF 1200w 200KB 이하 |

4:3은 폐기한다(X06). **풀블리드는 폐기한다**(RA-5·IM-7 · 2026-10-28). HW `BigBackdrop`과 `FullWidthPointSection`(`hw/page.tsx:497-507`, `sizes="100vw"`)이 퇴역 대상이고, 큰 도판은 콘텐츠 폭 plate로 둔다. system §4-2 'wide 없음'이 정본이다.

**크기 3단**(RA-5·IM-7, P2 프리미티브 → P4)

| 단 | 폭 | 쓰는 곳 | 규칙 |
|---|---|---|---|
| L (plate) | `max-w-page` 1200 안 12칸 전폭. bleed 없음 | 제품·장문 페이지 | 16:9 / 모바일 4:5 아트 디렉션, r0, 위에 글자 없음, 캡션은 아래. 종류는 photo(credit)·render(검증)·capture만, generated 금지. lazy. 예산: 홈 0 · SW ≤1 · HW ≤2 · 블로그 글 표지 1 |
| M | 2열 584 · Hero 5칸 480 | 본문 도판, Hero capture | — |
| S | 여백 도판 120~282(인용 초상 120×150부터 3칸 282까지) | 장문 본문 옆 | 캡션 문법 같음 |

- `figure`의 `data-plate`(L·M·S)로 예산을 센다. 같은 이미지 파일은 페이지당 1회다.
- **사전 크롭 손실은 16% 이하다.** 16:9 원본을 3:2로 자르면 15.6%라 허용된다.
- **업스케일은 0이다.** 원본이 기준에 못 미치면 그 컷은 사진 없이 간다.
- 런타임 `object-cover` 크롭은 한 변 5% 이하로 둔다. plate는 아트 디렉션 2컷으로 맞추므로 예외가 없다.
- `object-position`으로 버티던 곳(KeyUseCases `"86% 50%"`, CaseStudies `object-top`)은 사전 크롭이나 재캡처로 바꾼다.

**사례 사진 판정**: 감사 D4(실명 사례·인용 공개 동의) 표에서 '공개 동의'를 받은 학원만 대상이다.

| 원본 | 3:2 손실 | 판정 |
|---|---|---|
| daegu 1800×1200 | 0% | 사용 |
| cheonan·daechi 1800×1013 | 15.6% | 사용 |
| busan 1800×811 | 32% | 사진 없음(재촬영 대상) |
| pyeongtaek 1080×1350 | 47% | 사진 없음 |
| cheongju v3 768×1024 | 56%, 업스케일 필요 | 사진 없음. 미참조 v2와 원본 2장은 삭제 |
| online-12inedu 1282×719 | 화면 캡처 | `capture`로 재분류. 블러를 단색 `--surface-skeleton` 블록으로 재마스킹하기 전까지 노출 중단 |

- 사진이 없는 사례는 sheet 상자 없이 열린 단 문법으로 본문만 둔다(CO-9, cards_motion §3-5. sheet 상자는 사진 있는 사례만): 지역·과목 `text-label text-fg-muted`(Kicker 아님, X15. 카드 범주·지역 라벨은 그린이 아니다, C11) → H3 → 덱 → dl.
- 홈 사례는 3건을 정적으로 둔다(V10-A '05 기록', X06). 사진은 위 판정의 3장(대구·천안·대치)만 보정해 쓰고(IM-6, P3), 나머지는 사진 없는 사례 형태다.
- `photo`의 credit은 필수다(X11). 카드 스펙의 'photoCredit optional'은 이 규칙이 덮는다. credit이 없으면 사진을 렌더하지 않는다.

**사진 확보 파이프라인**
- **장부(P2, 지금)**: `data/image-credits.json`(§3-1)을 P2에서 바로 만든다. credit·`verifiedAt`(식별 얼굴·실명 사례면 `consentDocId`도)이 장부에 있어야 렌더된다. 실명 동의는 감사 D4를 따르고, 학생은 비식별(뒷모습·손·화면 중심)이 기본이다. 익명 사례는 파일명에도 실명을 넣지 않는다.
- **촬영 일정이 확정되면 더하는 것(P5)**: 촬영 브리프(§3-6b 12컷), 보호자 동의 양식.

### 3-5. 그레이딩: 에셋 단계에서 1회

`scripts/media/grade-photos.mjs`는 sharp로 처리하되 **저장소 의존성 밖에서 실행한다**(빌드·prebuild·CI에 넣지 않고 package.json에 의존성을 더하지 않는다). 순서는 **사진별 중립 패치 WB → 공통 그레이드**이고, 흰점은 `--surface-paper` 값과 같다(V15-A · 2026-10-28). 고정 배율 하나로는 맞출 수 없다. 지금 사례 사진 6장의 R−B 실측이 −26…+14로 흩어져 있기 때문이다. lift·채도는 보정 손잡이이고, 시안에서 대표 3장의 원본과 적용본을 나란히 보고 확정한다.

```js
// ponytail: 채널 선형 근사. 중립 패치 WB로 사진마다 색을 맞춘 뒤 공통 배율 하나를 건다. 시안 뒤 lift·saturation만 조정한다
const PAPER = [249, 248, 245]                         // --surface-paper #F9F8F5. 흰점 = paper
const GRADE = { lift: 8, saturation: 0.9, quality: 88 }
const a = PAPER.map((w) => (w - GRADE.lift) / 255)    // 흰 255 → PAPER, 검정 0 → 8(블랙 +3%)
console.assert(PAPER[0] >= PAPER[1] && PAPER[1] >= PAPER[2] && PAPER[0] - PAPER[2] >= 4 && PAPER[0] - PAPER[2] <= 7, "paper R≥G≥B, R−B 4–7")
// 1단계: 장부 neutralPatch [x, y, w, h](벽·천장의 흰 면) 평균으로 채널 게인을 구한다
const { channels } = await sharp(src).extract({ left: x, top: y, width: w, height: h }).stats()
const m = channels.slice(0, 3).map((c) => c.mean)
const wb = m.map((v) => (m[0] + m[1] + m[2]) / 3 / v)
// 2단계: WB 게인과 공통 그레이드를 한 번에 건다
sharp(src).rotate().toColorspace("srgb")
  .linear(a.map((k, i) => k * wb[i]), [GRADE.lift, GRADE.lift, GRADE.lift])
  .modulate({ saturation: GRADE.saturation })
  .resize({ width: maxLongEdge, height: maxLongEdge, fit: "inside", withoutEnlargement: true })
  .webp({ quality: GRADE.quality })   // 메타데이터를 보존하지 않으므로 EXIF·GPS가 지워진다. Next가 AVIF로 재인코딩하므로 마스터는 q88
  .toFile(out)                         // 새 파일명 {name}.g1.webp (immutable 캐시 때문)
```

- **대상**: 감사 D4 게이트를 통과한 사례 사진(P3 1차는 대구·천안·대치 3장, IM-6), 실사로 판정된 HW 사진, 제품 렌더, 영상 포스터와 루프(§3-11의 ffmpeg 필터).
- **제외**: 캡처(원본 색 유지), AI 생성 이미지.
- **측정 목표**(가장 밝은 중립 면의 평균): R−B 4–8, luma 250 이하, HSV 채도 .05 이하, 블랙 포인트 7 이상, 업스케일 0. 같은 페이지에 실리는 사진 세트의 R−B 폭은 4 이하다. 대표 3장은 밴딩을 육안으로 확인한다.

**제품 판 합성**(CO-7·CO-8, P4) — 같은 스크립트에 단계로 더한다. 출처를 확인한 알파 컷아웃만 판에 올린다.

| 판 | 판 색 | 접지 그림자(구움) | 쓰는 곳 |
|---|---|---|---|
| 밝은 판 | `--surface-sunken` 값 #F3F2EE, 16:10 무봉 | 대상 아래 1개, α ≤ .18, 띄움 0 | HW·/product 제품 도판, AICamera(paper 위) |
| 먹 판 | `--surface-ink` 값 #1A1917 | 1개, α ≤ .12 | HW AllInOne 먹 장 OPS 한 컷(CO-8) |

- 키 라이트는 좌상 하나로 통일한다. 색 후광·림 라이트·반사 바닥·네온·글로우는 0이고, blend·마스크도 0이다.
- 판 색은 V15-A 값으로 굽는다. 출력은 새 파일명(예: `{name}.p1.webp`, immutable 캐시)이고, /checkout 동결 파일은 쓰지 않는다.
- CSS `box-shadow`·`drop-shadow`·`filter`는 계속 0이다(X05). 구운 그림자는 이미지 내용이다.

### 3-6. 대체 소재 확보: 퇴출보다 먼저(Hero의 출처 미확인 도판은 예외, V11-A)

**3-6a. 실제 화면 재캡처**(촬영 없이 가능. 규격 P2 → 캡처 P3–P4, IM-4)
- **화면 도판 2종**:
  - **전체 캡처**(맥락): 1920×1200 앱 콘텐츠 영역만, 페이지당 1장.
  - **영역 캡처**(판독): 720×450 CSS px 영역을 DPR2로 캡처해 1440×900 마스터로 둔다. 16:10이라 크롭은 0이다.
- **판독 하한**: 도판 속 UI 본문 글자는 64rem 이상에서 렌더 10px 이상이다(슬롯 폭 ÷ 캡처 CSS 폭 × UI 글자 크기 ≥ 10. 예: 584px 슬롯에 영역 캡처면 13px UI 글자가 약 10.5px).
- **방법**: 테스트 계정, 라이트 테마, 배율 100%, 한국어 시드 데이터(학생 이름은 가명). 창틀·그림자·커서·알림·딤 모달 배경은 0이고 앱 콘텐츠 영역만 남긴다. 개인정보는 0이 되게 하고, 불가피하면 `--surface-skeleton` 토큰 값의 단색 블록으로 가린다. 블러는 쓰지 않는다. 한 세트는 같은 날·같은 창 폭으로 찍는다.
- **놓기**: 민트 패널 위 배치는 폐기한다. 40rem 이상에서는 매트 Frame(§3-7)에 둔다.
- **기존 파일**: `use-cases/generated/*-source.png`는 장부에서 실제 캡처로 확인하기 전에는 쓰지 않는다.
- **대상**:
  - ① EDB 판서 화면(전체 캡처). **Hero 최종 도판**이다(C09, IM-3, P3). 테스트 계정 EDB의 밝은 캔버스에 강사가 직접 쓴 중2 수학 '일차함수' 한 페이지를 캡처한다. 펜은 먹색과 강조 1색, 페이지 표시 '3 / 12'가 보이게 하고 이름·학생 정보는 0이다. 1920×1200, 400KB 이하, 모바일 전달 120KB 이하.
  - ② KeyUseCases 영역 캡처 4장: 수업 활동 게시, 숙제, 관리자 화면, 소통(SW 페이지로 옮겨 간다, V10-A).
  - ③ 마스킹한 AI 리포트 화면(가능하면).
  - ④ 홈 '04 화면'(V10-A)의 영역 캡처 1장(매트 Frame).
- **처리**: sharp로 webp로 변환하고 그레이딩은 하지 않는다. `public/images/captures/{subject}.2026-11.webp`처럼 새 이름을 쓴다.

**3-6b. 하루 촬영 12컷**(P5, 외부 의존, 감사 D4 동의 선행, IM-6)
1. **대상**: 감사 D4 동의를 받은 학원 1곳, 같은 날 12컷. 강사가 보드 앞에서 수업하는 장면(뒷모습·측면, 학생 비식별), 보드 판서 클로즈업, S86 설치 전경, 제품 매크로(베젤·펜·OPS 슬롯). 샷리스트: 빈 교실 설치 전경 · 강사 3/4 뒷모습과 한국어 판서 · 손과 펜 판서 매크로 · 학생 손과 태블릿 공동 판서 · 원장 어깨 너머 관리자 데이터(테스트 데이터) · 수업 뒤 저장된 판서 페이지 · 수업 전 EDB 준비 · 보드 위 카메라 실설치 · OPS 슬롯 매크로 · 원장 환경 초상(서면 동의, 페이지당 1장 이하) · 저녁 빈 교실의 저장된 판서 · 교실 번호판(간판은 동의 시만).
2. **빛**: 자연광과 웜 화이트 LED 3600–3800K 단일 색온도. 형광등은 끄거나 같은 색온도로 맞춘다. 카메라 WB 4000–4200K. 사진별 `neutralPatch`(벽·천장의 흰 면) 좌표를 장부에 적는다(§3-5).
3. **구도**: 35–50mm 환산, 눈높이 1.2–1.4m. 3:2 마스터로 찍고 가장자리 10%를 안전 여백으로 둔다(4:5 크롭 대비). 글자를 얹을 빈 면은 만들지 않는다.
4. **사람**: 성인은 서면 초상 동의를 받는다. 미성년자는 비식별이 기본이고, 식별되면 보호자 동의를 받는다. 간판·교재 로고는 학원이 동의할 때만 보인다.
5. **화면 속 내용**: 실제 Classin UI와 한국어만 쓴다. 경쟁사 기기와 외국어 UI는 넣지 않는다.
6. **소품**: 서양 스톡 소품(지구본·사과·포스트잇)은 쓰지 않는다.
7. **납품**: RAW + sRGB JPEG, 긴 변 3600px 이상. 파일명은 `{page}-{subject}-{nn}`이고 실명을 넣지 않는다.
8. **AI 생성 이미지**: §3-1 금지를 따른다. 인공지능기본법(2026-01 시행) 고지 의무와 맞는지는 법무 확인이 필요하다[지식].

### 3-7. Frame: 목업·실제 화면 (C05·X05·X10)

```tsx
type Annotation = { x: number; y: number; note: string }   // 좌표 %(크롭 0인 도판만)
type FrameProps =
  & ({ id: CaptureId; annotations?: Annotation[]; caption?: ReactNode; captionPlacement?: "below" | "margin"; folio?: number; children?: never }   // capture: 장부 kind "capture" 행
   | { id: MockId; annotations?: never; caption?: never; folio?: never; children: ReactNode })   // 코드 목업: 장부 kind "mock" 행(file 없음, summary) + 자식 목업 컴포넌트(2026-10-28). mock에 주석·캡션을 넘기면 타입 오류(C05: 캡션 대신 태그)
  & ComponentPropsWithoutRef<"figure">
// CaptureId·MockId는 장부에서 kind별로 뽑은 ImageId 부분집합이다
// 출력: <figure data-frame={kind} {...rest}> — data-frame은 가드 예산(섹션당 ≤1)과 도판 현상(MO-4) 계측용
```

| 속성 | 값 |
|---|---|
| 매트(V16-A · 2026-10-28) | 40rem 이상: Frame 바깥에 `bg-surface-sunken` 여백판, 패딩 20px(64rem 이상 32px). r0, 바깥 테두리 0, 그림자 0. sunken 섹션 위에서는 매트를 `bg-surface-sheet`로 둔다. 40rem 미만: 매트 없이 콘텐츠 폭 전체(전폭) 캡처 |
| 상자 | `relative isolate overflow-hidden border border-line-hair bg-surface-sheet`(r0, V14-A). 그림자 0. 대표 Frame용 elevated 변형은 없다(X05) |
| 제목줄 | **없다.** 36px 제목줄도, 신호등 점을 뺀 창틀도 쓰지 않는다 |
| mock 표식 | Frame 안 오른쪽 위 점선 태그: `absolute top-3 right-3 border border-dashed border-line-control bg-surface-sheet px-2 py-0.5 text-note font-medium text-fg-muted` 글자 `예시 화면`(r0, V14-A). 코드 목업 본문은 위 패딩 48px(`pt-12`)로 태그 자리를 비운다 |
| capture 표식 | 태그 없음. 캡션 오른쪽에 `실제 화면 · YYYY.MM 캡처`. 캡션은 매트 바깥 아래, 또는 64rem 이상 비전폭 도판이면 여백 칸(§3-2) |
| 본문 | capture는 `aspect-screen` + next/image(16:10 재캡처라 크롭 0, 전체 또는 영역 캡처 §3-6a). 코드 목업은 높이 자유 |
| 내부 UI(mock) | 회색조(`--fg-ink/body/muted`·hair)와 강조 1계열 `--fg-accent`, 한글 라벨, 13px 이상. 신호등 점·회전·겹침·글래스·그라데이션·무한 루프는 0 |
| 내부 UI(capture) | 원본 색 그대로. 리컬러·필터 금지 |
| 수치 | 목업 안 수치는 '예시 화면' 태그가 덮는다. KPI처럼 수치를 크게 쓰면 KpiSpark(§3-10)의 '예시' 표기를 따른다 |
| 접근성 | mock 본문은 `aria-hidden`이고, 바로 뒤에 `<p className="sr-only">예시 화면: {summary}</p>`를 둔다. summary에는 화면에 보이는 모든 수치를 넣는다. capture는 next/image alt(`[화면 이름] 화면: [핵심 1줄]`) |
| 놓는 곳 | paper·sunken 섹션 위에만 둔다(C19. sheet는 섹션 지면이 아니라 물건에만 쓴다, V10-A). 먹 지면(`.surface-ink`) 위에는 두지 않는다(surfaces §3-5 허용 목록). 민트 패널 위 배치는 폐기한다 |
| 예산 | 섹션당 1개(가드 `--budget`). 탭 패널마다 Frame이 있으면 비활성 패널은 마운트하지 않는다(Radix 기본값) |
| 우선순위 | 실제 캡처가 있으면 목업보다 우선한다 |

### 3-8. 주석(리더선)

- **장부 kind가 `capture`인 Frame(`id`)에만 단다.** 타입으로 강제한다(§3-7). 사진, 목업, 생성 이미지에는 달지 않는다. 매트가 있어도 좌표는 안쪽 캡처 기준이다.
- 섹션당 1개이고, 같은 의미를 본문 텍스트에도 써야 한다.
- 좌표가 %이므로 크롭 0인 도판에만 단다.

| 요소 | ≥64rem(2열 레이아웃) | <64rem |
|---|---|---|
| 점 | 6px 원 `bg-fg-accent`(`size-1.5`), `left:x%; top:y%; translate(-50%,-50%)` | 마커로 대체 |
| 리더선 | 1px `--line-control`. 가로 직선이 기본이고 꺾이면 직교 1회, 24–64px. **Frame의 형제 래퍼**(`relative`)에 그린다. `overflow-hidden`은 Frame 본체에만 있다 | 없음 |
| 메모 | `text-note font-medium text-fg-muted`(13/500), `max-w-[14em]`, 160px 이상 거터에 둔다(도판 위 글자 0) | 도판 아래 `<ol type="a">` 같은 글자 |
| 마커 | 없음 | 22px 인라인 SVG(`<circle r="10.5">` 1px `--fg-accent` 선 + `--surface-sheet` 채움, `<text>` `a`·`b` 13/500 `--fg-accent`; `rounded-full` 클래스 없음 — 원형 허용목록 밖이라 SVG로 그린다, 2026-10-28, 14px 이하 600 금지 RA-6), `aria-hidden`(목록의 a·b가 읽힌다). `border-fg-accent`는 C02 매핑(`--color-fg-accent`)에서 나오는 유틸이다(IconFrame 활성 테두리와 같다) |

### 3-9. 펜 도해

| 요소 | 값 |
|---|---|
| 정보선 | `--stroke-pen`(1.5px, DPR1 2px), 색 `--line-control` #8A857F(sheet 3.66 / paper 3.44 / sunken 3.26, V15-A). **skeleton `#EFEEE9` 위에는 금지**(3.15:1. 자리표시 면이라 정보선을 두지 않는다). SVG는 non-scaling-stroke, HTML은 border |
| 경로 | 직교 배선만, 꺾임 r3. 사선·곡선 연결은 쓰지 않는다 |
| 끝 | 화살촉 금지. 지름 6px 단자 점(SVG `circle.dg-line r=3`), 선과 같은 색. 방향은 열 순서와 읽기 순서가 말한다 |
| 강조 | 도해당 경로 1개, `--stroke-accent` `--fg-accent`. DPR1에서는 정보선과 굵기가 같아지므로 구분은 색이 맡는다(C11) |
| 노드 상자 | 채움 없음, 윤곽은 정보선과 같은 `--stroke-pen` `--line-control`(SVG `rect.dg-box`, HTML `border-(length:--stroke-pen) border-line-control`, C11·C23), r0(V14-A), 패딩 16×20, 최소 높이 72. 노드에 아이콘 원을 두지 않는다(SY-3) |
| 노드 머리 | 상태 점(`status-dot`, icons 소유: ● 테두리·채움 `--fg-accent` / ○ 테두리 `--line-control` + 채움 transparent) + 이름 `text-body font-semibold text-fg-ink` → 설명 `text-caption text-fg-muted`(2줄 가이드). 노드에 폴리오는 붙이지 않는다 |
| 글자 | HTML 또는 인라인 SVG로 Pretendard를 상속한다. 렌더 13px 이상. `<img>` SVG 안에는 글자를 넣지 않는다 |
| 모눈 | 도해 figure 자체의 배경으로만 쓴다(`pattern-grid`, surfaces 소유). 페이지당 1개, 홈은 '03 흐름'의 OS 지도뿐(C19) |
| 금지 | 3D, 글래스, 글로우, 그라데이션, 캐릭터, 이모지, 손그림, 채운 삼각 화살촉, 아이콘 원, 노드·바깥 줄의 둥근 모서리, `#A39E98` 선, 무한 루프 |

**대표 도해 '수업 OS 지도'**: `components/diagrams/LessonOsMap.tsx`(서버 컴포넌트, SVG·JS 0, 선은 CSS border)

- **사용처**: 홈 '03 흐름'(SolutionOverview, sunken. 홈에서는 이곳뿐이고 Hero에 중복하지 않는다, C09·V10-A), `/product` 인덱스, ai-report 파이프라인, docs `lesson-os-map`.
- **SSOT 상수**: `lib/classin-positioning.ts`에 둔다. 이름과 순서는 C08 장부 6행(칠판·교안·녹화·LMS·학생 관리·관리자 데이터)과 같고, cards_motion ProblemCost의 `module` 값과 같은 문자열이다. ProblemCost 정성 장부(C08) 6행도 이 상수를 쓴다. 지도는 `phase`로 열을 나누므로 배열 순서가 열 안 순서만 정한다.
  ```ts
  export const OS_MODULES = [
    { name: "칠판", phase: "during" },
    { name: "교안", phase: "before" },
    { name: "녹화", phase: "during" },
    { name: "LMS", phase: "after" },
    { name: "학생 관리", phase: "after" },   // 위치는 열린 질문
    { name: "관리자 데이터", phase: "after" },
  ] as const
  export const OS_PHASES = [
    { id: "before", label: "수업 전", artifact: "EDB 교안 파일" },
    { id: "during", label: "수업 중", artifact: "판서·녹화" },
    { id: "after",  label: "수업 후", artifact: "녹화 링크·숙제 제출 기록" },
  ] as const
  export const OS_OUTSIDE = "연동 범위 · 결제 · 오프라인 출석 · 고급 리포트"   // honestLimit 요약
  ```

| 요소 | 데스크톱(≥64rem) | 태블릿(40–64rem) | 모바일(<40rem) |
|---|---|---|---|
| 배치 | 3열 그리드, gap 48 | 3열, gap 24, 노드 설명 숨김(`sm:max-lg:hidden`) | 1열로 쌓음 |
| 열 머리 | 라벨 `text-body font-semibold`(16/600) + 아래 1px `--line-hair`(장식선. `--line-strong`은 C23 닫힌 목록 밖). **숫자 폴리오 없음**(C24) | 같음 | 같음 |
| 산출물 | 노드 아래 `text-note text-fg-muted`(정적) | 같음 | 같음 |
| 낙하선 | `--stroke-pen` `--line-control`, 꺾임 r3, 'OS 버스'에 닿는다 | 같음 | 16px 가로 토막 |
| OS 버스 | 세 열을 가로지르는 `--stroke-accent` `--fg-accent` 가로선, 양끝 6px 단자 | 같음 | x=11px 세로선, 노드는 32px 들여쓰기 |
| 버스 라벨 | `수업 시스템 OS` `text-label text-fg-ink`(비상호작용 라벨은 그린이 아니다. 그린은 버스선 한 경로, 2026-10-28) | 같음 | 같음 |
| 바깥 줄 | `OS_OUTSIDE`: 1px **dashed** `--line-control` 윤곽, r0(V14-A), `text-note font-medium text-fg-muted`. 점선은 '실선(포함) 밖'이라는 뜻이고 예시 태그와 같은 문법이다 | 같음 | 같음 |
| 글자 크기 | 그대로 | 그대로 | 그대로 |

- **●점등 훅**: 노드마다 `os-node` 클래스와 `style={{ "--i": n }}`을 단다. 열에는 클래스 없이 `data-phase`만 단다(`os-col` 클래스는 없다, naming 4). SolutionOverview가 `current` phase를 넘기면 해당 열에 `data-current`를 단다. 점등 동작과 노드 상자 CSS는 cards_motion이 소유한다(C07). 점등은 노드 점의 ○→● 색 전이다(border-color·background-color, `var(--motion-slow)` `--ease-fade`, 노드 간격 `--motion-stagger` 80ms, 1회, V17-A). opacity 전이가 아니다. ○→● 전이는 `.os-node .status-dot`과 `.success-panel .status-dot`(폼 성공 패널, controls 소유) 두 곳에서만 허용된다(icons status-dot).
- **○→● 콜백**(MO-2, P3): 홈 '02 공감' 정성 장부 6행과 '03 흐름' OS 지도 노드는 같은 `OS_MODULES` 이름·순서를 쓴다. 라벨 배열 동일성 단위 테스트를 둔다. reduced·no-JS에서는 ● 6개가 완성 상태로 보인다.
- **모눈**: SolutionOverview만 `className="pattern-grid"`를 넘긴다.
- **접근성**: 글자는 모두 HTML이라 그대로 읽힌다. 선·버스·단자는 `aria-hidden` 장식이다.

**docs 도해 4종**: 데이터 모델은 그대로 두고 렌더 레지스트리로 바꾼다.

- `app/docs/_utils.tsx`에 `DOC_DIAGRAMS: Record<string, ComponentType>`를 기존 `src` 문자열 키로 둔다. `DocMedia`는 `src`가 레지스트리에 있으면 컴포넌트와 캡션을 출력하고, 없으면 기존 이미지 경로로 간다. DB·관리자 마크다운 경로(`toSafeDocMedia` 화이트리스트, `![alt](src)`)도 `src`를 보존하므로 그대로 동작한다.
- `lesson-os-map.svg`는 `LessonOsMap`으로 렌더한다(같은 도해를 세 벌로 두지 않는다).
- `install-flow`, `lesson-options`, `adoption-routine`은 `components/diagrams/docs/*.tsx` 인라인 SVG 컴포넌트로 만든다. 컴포넌트마다 판 두 개를 둔다.

| 판 | viewBox 폭 | 클래스 | 배율 근거 |
|---|---|---|---|
| 넓은 판 | 640 | `hidden md:block w-full max-w-article` | 기사 열이 md(768) 688px, lg(1024) 678px, xl 680px 이상이라 배율 ≥1.0, 상한 720/640=1.13 |
| 좁은 판 | 328 | `md:hidden w-full max-w-sm` | 360px 뷰포트에서 열 328px라 배율 1.0, 상한 384/328=1.17 |

- 글자: 머리 16/600, 본문 14. 인라인이라 Pretendard를 상속한다.
- 선: `.dg-line` / `.dg-accent` / `.dg-box`(노드 윤곽, 정보선과 같은 값). 화살촉은 단자 점으로 바꾼다.
- `adoption-routine` 루프에는 숫자 순서 표시(01–04)를 두지 않는다. 순서는 배치(읽기 순서·직교 배선)와 단계 이름이 말한다. 도해 안 숫자는 C24 번호 체계 후보(Act 폴리오·No. 01·그림 n·표 n·각주 n) 밖의 장치이고, docs 글의 그림 n·표 n·각주 n과 합치면 상한 2종을 넘을 수 있다(주석 마커를 a·b로 정한 취지와 같다).
- 접근성: SVG마다 `role="img"` + `aria-label`. 숨긴 판은 `display:none`이라 읽히지 않는다.
- 전환한 뒤 `public/images/docs/diagrams/*.svg`는 grep 0건을 확인하고 삭제한다.

### 3-10. 차트 (C06, 소유. gap: 차트 프리미티브 API·데이터 계약)

**문법**

| 요소 | 값 |
|---|---|
| 강조 계열 | 1개. `chart-stroke chart-accent`(`--stroke-accent` `--fg-accent`) |
| 비교 계열 | 0–1개. `chart-stroke chart-compare`(`--stroke-pen` `--line-control`). 가공 비교선은 금지 |
| 목표·평균선 | SVG가 아니라 HTML `div`: `border-t-(length:--stroke-pen) border-dashed border-line-control`. non-scaling dash는 브라우저마다 동작이 달라 쓰지 않는다 |
| 면 채움 | **없다**(선·막대·끝점만) |
| 기준선 | 축선 없음. HTML 1px `--line-hair` 가로 기준선 최대 5줄(1.18:1, 장식). 세로 격자 0. 정보는 직접 라벨이 진다 |
| 눈금 | HTML `text-note text-fg-muted tabular-nums`. Y는 왼쪽 거터 40px 오른쪽 정렬, X는 아래 8px. 정적 |
| 직접 라벨 | 선 끝 오른쪽 8px, `text-note font-medium`(13/500, RA-6), **끝값 포함**(`우리 학원 92%`). 강조는 `text-fg-accent`, 비교는 `text-fg-muted`(선 색은 글자 대비 미달). 라벨 간격이 플롯 높이의 9%(200px에서 18px) 미만이면 서버에서 세로로 밀어낸다 |
| 끝점 | 강조 계열 마지막 점에만 6px 원(차트 SVG 안 `<circle r="3">` `--fg-accent` 채움, `rounded-full` 없음). 다른 마커는 0 |
| Y 매핑 | 데이터 범위를 플롯의 4–96%로 매핑하고 svg에 `overflow-visible`. 극값 선이 잘리지 않는다 |
| 막대 | 가로 우선, 단색(강조 1행 `--fg-accent`, 나머지 `--line-control` 3.66), 두께 14 / 행 32, 모서리 r0(V14-A: 반경은 0·6·원형뿐), 트랙 0. 값 라벨은 끝 뒤 8px `text-note font-medium text-fg-ink tabular-nums`(13/500, RA-6) |
| 기준값 | 막대는 0에서 시작한다. 선이 0이 아닌 기준이면 맨 아래 눈금을 표시하고 캡션에 `세로축 {n}부터`를 쓴다 |
| 숫자 | `lib/format.ts`의 `formatNumber`(system §8). 음수는 U+2212, 단위는 붙여 쓴다('34%'). `toLocaleString`을 직접 호출하지 않는다 |
| 제목(H3, 차트 위) | 실데이터는 발견형(`재학습 절약률은 하루 만에 34%까지 떨어졌습니다`). 예시 데이터는 **서술형**(`주차별 과제 제출률`)이고 제목에는 '예시'를 붙이지 않는다. 결론형은 금지 |
| 캡션 | Figure 문법. `example:false`: 왼쪽 `[그림 n · ]단위 · 기준일`, 오른쪽 출처. `example:true`: 컴포넌트가 캡션 끝에 `· 예시`를 붙인다(`단위 % · 예시`, 타입으로 강제). 오른쪽 출처 칸은 비운다 |
| 툴팁 | 없다. 직접 라벨이 대신한다 |
| 놓는 곳 | paper·sunken 지면, 또는 sheet 물건(Frame·카드·표) 안. 먹 지면에는 두지 않는다(허용 목록 밖). 토큰은 자동 전환되지만 사용처는 0이다 |
| 금지 | 그라데이션, 면 채움, 도넛 남발, 3D, 범례 박스, 카운트업, 가공 비교선, blur 툴팁 |

**프리미티브**: 새 폴더 `components/charts/`. 서버 컴포넌트, JS 0, 공개 사이트의 유일한 차트 경로다.

```ts
// components/charts/types.ts
export type ChartTruth =
  | { example: true }                                                              // 캡션 끝 ' · 예시'(제목은 그대로)
  | { example: false; source: { name: string; href?: string; asOf: `${number}.${number}` } } // 출처 필수
export type Series = { name: string; values: number[] }   // values.length === x.length
```

1. **`LineChart(ChartTruth & { title; x: string[]; accent: Series; compare?: Series; target?: { label: string; value: number }; yTicks: number[]; unit: string; note?: string })`**
   - 기울기(before/after)도 x 2개로 그린다.
   - 레이아웃: `<figure>` → H3 → `div.relative h-50 sm:h-60`(200/240px), 패딩 `pl-10 pr-14 sm:pr-18 pb-7`.
   - 정적 레이어: 기준선, 눈금(HTML).
   - 등장 레이어 3개:
     - 비교 `<svg data-seq="0">`
     - 강조 `<svg data-seq="1">`
     - 끝점·직접 라벨·목표선 `<div data-seq="2">`
   - 각 svg는 `viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden class="absolute inset-0 size-full overflow-visible"`이다.
   - `<table className="sr-only">`(caption = 제목, 행 = x, 열 = 계열)를 자동으로 만든다.
2. **`BarList(ChartTruth & { title; rows: { label: string; value: number; accent?: boolean }[]; unit: string; max?: number })`**
   - HTML 그리드 `grid-cols-[minmax(6rem,30%)_1fr_auto]`, 행 32px, 막대 폭은 `calc(var(--v) * 100%)`.
   - `accent` 행은 1개 이하다. 레이어는 비교 막대(0) → 강조 막대(1) → 값 라벨·각주(2).
   - sr-only 표를 자동으로 만든다.
3. **`KpiSpark({ example: true; label; value: string; unit?; series: number[] })`**
   - 위 1px `--line-hair`(장식선) → 값(`text-numeral`, 비례 숫자 · X14 개정) + 같은 줄 `예시`(`text-caption font-semibold text-fg-ink`, X11) → 24px 스파크라인(강조 계열 `chart-stroke chart-accent` = `--stroke-accent` `--fg-accent`, non-scaling, 끝점 6px SVG `<circle r="3">`) → 라벨.
   - 지금은 `example: true`만 받는다. 실데이터 KPI는 `Numeral(factId)`로 쓴다(system §7). 실데이터 스파크가 필요해지면 그때 `factId` 변형을 더한다.
   - **mock Frame 안 전용이다.** 같은 줄 `예시`는 Frame 안에서만 쓴다(X11). 유일한 사용처였던 DashboardPreview가 홈 목차에서 빠지므로(V10-A) 지금 사용처는 0이다. 사용처가 생길 때 만든다. Frame 밖 예시 수치 묶음이 필요해지면 그때 같은 줄 `예시`를 끄는 `inFrame: false` 변형을 더하고, 묶음 아래 `수치는 예시입니다` 캡션 1회만 단다(§3-2).

**등장**(C06): 페이지당 1개, opacity만 쓴다.
- `<Reveal bare threshold={0.4}>`로 감싼다(X07 시그니처: `bare`이면 `reveal-anim` 없이 `data-reveal`만 단다).
- `[data-seq]` 레이어가 opacity 0→1, `--motion-slow`(900ms) `--ease-fade`, 지연 `--seq` × `--motion-beat`(0·1·2박자)로 나타난다(총 약 1.4초, V17-A · 2026-10-28). 전이 규칙은 cards_motion §3-14 ④ 한 곳이고, 레이어는 `data-seq` 0·1·2만 단다(§2 박자 규칙이 `--seq`를 준다). transform은 0이다.
- stroke-dashoffset과 `.draw-path`는 사이트 전체에서 0이다. 늘어나는 SVG(`preserveAspectRatio="none"` + non-scaling-stroke)에서 Chrome이 `pathLength` 정규화를 무시해 dash가 깨지기 때문이다.
- **페이지별 등장 1개**: 홈은 0(DashboardPreview가 빠진다, V10-A), SW는 분석 차트, HW는 LatencyProof(감사 D5 확정 뒤). 망각 곡선은 정적이다.
- 등장 차트가 들어 있는 섹션은 이 bare Reveal이 섹션의 유일한 Reveal이다(섹션당 `[data-reveal]` ≤1). 섹션 머리는 정적이다.

**DashboardPreview**: V10-A 홈 11지면 목차에서 빠진다. 서버 차트로 다시 짓지 않고, 다른 사용처가 0이면 `DashboardPreview.tsx`·`DashboardPreviewCharts.tsx`를 삭제한다(공개 recharts import 0). 홈의 화면 증거는 '04 화면'의 영역 캡처 1장(매트 Frame)이 맡는다.

**망각 곡선**(ScienceBased는 홈에서 빠져 각주 단 블로그 글로 옮긴다, V10-A): LineChart 단일 계열, `example: false`, 정적(Reveal 없음).
- 점은 출처가 있는 지점에만 찍는다. 에빙하우스(1885) 재학습 절약률은 20분 58.2, 1시간 44.2, 9시간 35.8, 1일 33.7, 2일 27.8, 6일 25.4, 31일 21.1이다[지식].
- **원문 대조를 마치기 전에는 머지하지 않는다**(수용 기준).
- 축 이름은 '재학습 절약률(%)'이다. 캡션은 `가로축 간격은 시간 비례 아님 · 1인 자기 실험`, 출처는 `Ebbinghaus(1885)`다.
- 지금 인용문 "20분 42%, 하루 67%"는 망각률로 바꿔 말한 값이므로 같은 출처로 다시 쓴다.

### 3-11. 영상과 포스터 (C07·V3-A, gap: 영상 대체물)

**홈에는 영상이 없다**(V3-A). 배경 루프는 제품 페이지에서만 허용하고, 조건은 다음 넷이다(C07): `(width >= 64rem)`, `(hover: hover)`, `(prefers-reduced-motion: no-preference)`, 정지 버튼과 화면 밖 정지.

**파일별 분류**

| 파일 → 새 이름 | 분류 | 처리 |
|---|---|---|
| `video/home-hero.mp4` | 쓰지 않음 | V3-A로 홈에서 빠진다. 다른 사용처가 0이면(현재 Hero.tsx뿐) 삭제한다 |
| `video/쿼드러닝 수업_클립1.mp4` → `sw-classroom-loop.g1.mp4` | SW 히어로 배경 루프(지금도 SW 히어로 영상이고 원본은 1080p) | `-an`, 720p. 클립 권리를 장부에서 확인한 뒤에만 쓴다(IM-9, P4). 서양 스톡 포스터(페이지에 두 번)는 지정 프레임 포스터로 바꾼다. 권리가 없으면 영상과 스톡 포스터를 내리고 텍스트 히어로로 둔다 |
| `video/클립2.mp4` → `sw-board-loop.g1.mp4` | SW 칠판 배경 루프 | `-an`, 색 태그 명시(원본 unknown을 bt709로 가정) |
| `video/Interactive Learning with ClassIn.mp4` → `hw-interactive-loop.g1.mp4` | HW 배경 루프 | `-an`, Figure 16:9 r0 + 정지 버튼 |
| `images/video/classin-brand.mp4` | **무음 내용 영상**(오디오 스트림 없음) | 재인코딩 불필요(720p 0.4Mbps). 자동재생·루프를 해제하고 `controls` + 0프레임 포스터를 단다. 영상 아래 장면 요약 텍스트(WCAG 1.2.1). 음성이 없으므로 자막 트랙은 필요 없다 |

**배경 루프 인코딩**: `scripts/media/encode-video.sh`
```sh
ffmpeg -i "$in" -an \
  -vf "scale=1280:720:in_color_matrix=bt709:out_color_matrix=bt709:out_range=tv,colorlevels=romin=0.031:gomin=0.031:bomin=0.031:romax=0.976:gomax=0.973:bomax=0.961,eq=saturation=0.9,format=yuv420p" \
  -c:v libx264 -profile:v high -crf 23 -maxrate 2500k -bufsize 5000k -g 50 \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -movflags +faststart "$out"
```
`colorlevels`의 출력 흰점은 `--surface-paper` 값 (249,248,245)이고(romax·gomax·bomax = 값 ÷ 255, V15-A), 블랙 8은 사진 그레이딩과 같다. 이 스크립트도 저장소 의존성 밖에서 실행한다. crf 27로 시험하면 목표의 1/3 크기가 나와 화질 여유가 있으므로 23을 쓴다.

| 항목 | 배경 루프(제품 페이지) | 내용 영상 |
|---|---|---|
| 상한 | 파일당 5MB, 2.5Mbps, 720p, 오디오 스트림 0 | 2.5Mbps 이하. 음성이 있으면 `*.ko.vtt` + `<track kind="captions" srclang="ko" default>` |
| 포스터 | 인코딩 결과에서 판서가 가장 잘 보이는 지정 프레임(`posterAt`)을 뽑아 webp로, 사진과 같은 그레이드(§3-5)를 건다(IM-9). **next/image 포스터만** 쓰고 `<video poster>`는 쓰지 않는다(중복 요청). 같은 포스터 파일은 페이지당 1회 | 대표 프레임 1장 |
| 로딩 | `LOOP_MEDIA_QUERY = "(width >= 64rem) and (hover: hover) and (prefers-reduced-motion: no-preference)"`를 `components/media/HeroVideoBackdrop.tsx`로 옮긴다(Hero.tsx의 상수는 삭제). 맞지 않으면 `<video>`를 만들지 않는다. `navigator.connection.saveData`는 있는 브라우저에서만 추가로 막는다. idle 로드(`setTimeout(900)` 폴백 유지) | `preload="none"`, 자동재생 없음 |
| 정지 | 영상 루트를 IO(threshold 0)로 보다가 화면 밖이면 `pause()`. sticky 덮개 구조라면 덮개 섹션 상단 센티넬을 본다. `document.hidden`이면 정지. 사용자가 멈춘 영상은 다시 들어와도 재생하지 않는다 | 브라우저 컨트롤 |
| 정지 버튼(WCAG 2.2.2) | 아래 표 | — |
| 대체물 | 장식 루프는 `aria-hidden`. 장면 요약은 필요 없다 | 영상 바로 아래 장면 요약(무음) 또는 대본 링크(음성) |
| LCP | 영상은 LCP 경로에 넣지 않는다. 첫 화면 포스터는 라우트 LCP 후보 1개로 preload | — |
| 페이드 | 포스터 위 `<video data-loop data-ready>` opacity 0→1 `--motion-slow` `--ease-fade`(no-preference 블록) | — |

**정지 버튼** `data-media-toggle`

| 속성 | 값 |
|---|---|
| 크기 | `size="icon-md"` 44×44 = 히트 영역(공개 화면에 36px 버튼 없음, C15). 아이콘 Pause/Play 20 |
| 모양 | 정본 `<Button variant="line" size="icon-md" data-media-toggle aria-label=…>`(C15, controls '영상 정지 버튼'과 같다). raw `<button>`, `surface-ink` 채움, className으로 덮은 모양은 쓰지 않는다(C14: 먹 위 컨트롤 0, controls 원칙 8). 놓인 면의 토큰을 그대로 받는다: paper·sunken 위 테두리 `--line-control` #8A857F(3.44/3.26), 아이콘 `--fg-ink` #111110. 반경은 컨트롤 r6(V14-A) |
| 포커스 | 전역 보증 ①의 `outline: 2px solid var(--fg-accent); outline-offset: var(--focus-offset)`(2px, MO-5) 하나다(paper 위 #084734 10.08:1). 별도 규칙·box-shadow 2톤은 없다(X05) |
| 상태 | `aria-label`(`영상 정지` / `영상 재생`)과 아이콘은 **`video.paused`에서 파생**한다(`onPlay`/`onPause` 구독). `play().catch(() => setPaused(true))`이므로 저전력 모드에서 autoplay가 막혀도 라벨이 실제 상태와 맞다 |
| 쌓기 | `HeroVideoBackdrop`는 `children`(히어로 콘텐츠)을 받아 영상 박스 안에 영상 → 스크림 → 콘텐츠 순서로 렌더하고, 버튼은 영상 박스 **밖** 다음 형제로 렌더한다. z 리터럴 없이 DOM 순서로 쌓인다. 콘텐츠 래퍼의 `z-10`은 지운다 |
| 위치 | 영상 박스 바로 아래 줄 오른쪽 끝(Figure 영상이면 캡션 줄 오른쪽, `mt-3 flex justify-end`). 영상 위에 겹치지 않으므로 프레임 밝기와 무관하게 대비가 고정되고, 투명한 line 변형으로도 1.4.11을 채운다 |

### 3-12. 영상·사진 위 글자와 먹 지면

- **먹 지면에는 사진·Frame·차트·도해를 두지 않는다**(surfaces §3-5 허용 목록). Manifesto, Footer, SW FullscreenQuote는 글자만 둔다.
- **먹 지면 위 제품 컷아웃**(HW OPS, 허용 목록의 유일한 이미지)은 `--surface-ink` 값 #1A1917 판에 **미리 합성한** webp를 쓴다(V15-A·CO-8, §3-5 먹 판: 접지 그림자 α ≤ .12). `mix-blend`, 마스크, 글로우는 쓰지 않는다. HW 먹 장은 AllInOne 하나이고, 그 안에 제품 한 컷과 capability hair 행 목록을 둔다. 라벨은 '제품 렌더'이고 출처가 확인되지 않으면 타이포 먹 + 행 목록으로 둔다. 이 컷이 '평균 휘도 ≥100' 규칙의 유일한 예외다(§1 원칙 10).
- **영상·사진 위 글자**는 큰 글자(24px 이상, 또는 18.66px 이상 볼드)와 CTA 버튼만 허용한다. 스크림은 `<div aria-hidden className="absolute inset-0 bg-surface-scrim" />` 한 겹이다.

| 스크림 | 흰 글자 #FAFAF8 3:1 통과 조건 | 4.5:1 통과 조건 |
|---|---|---|
| `--surface-scrim` .48 | **모든 프레임**(최대 합성 밝기 141 → 3.19:1) | 프레임 최대 밝기 206 이하 |
| 없음 | 프레임 최대 밝기 145 이하 | 115 이하 |

  .48은 3:1 기준(큰 글자)을 프레임 측정 없이 보장한다. 그래서 별도의 .40 스크림 토큰을 만들지 않는다. 결정 V3 옵션 B 문구의 '평면 스크림 .40'도 X01의 `--surface-scrim`(.48) 한 토큰으로 읽는다. 이 차이는 스펙 오류가 아니라 정본 안 V3-B 문구와 X01 사이의 불일치이므로, V3-B 문구를 '.48(X01)'로 정리해 달라고 system에 요청한다(§11-11). 본문 문단·캡션처럼 18px 미만 글자를 영상 위에 둘 때만 0.5초 간격 프레임의 글자 상자 영역 최대 밝기가 206 이하인지 잰다. 넘으면 그 글자를 영상 밖으로 옮긴다.
- **HW BigBackdrop·FullWidthPointSection**: 풀블리드를 폐기하고 콘텐츠 폭 plate(L, §3-4)로 바꾼다(RA-5 · 2026-10-28). 베젤 사진(약 #C8C8C8)은 스크림 없이 큰 글자 3:1에 미달하므로 카피(H2 + 덱)를 **plate 아래 paper로 옮긴다.** plate 위 글자가 0이므로 스크림도 0이다. 먹 띠는 만들지 않는다(HW 먹은 AllInOne 1장). `sizes="100vw"`는 L 표준 문자열(§6)로 바꾸고, `useScroll` scale은 삭제한다(이미지 스크롤 연동 0). HW plate는 2개 이하이고, 출처 미확인 렌더는 plate에 올리지 않는다.

### 3-13. 선화·빈 상태·블로그 (gap: 선화 제작 기준, 404·빈 상태)

- **스팟 선화 6종**: 404, 오류, 빈 목록, 검색 0, 접수 완료, 점검. 파일은 `components/diagrams/spots.tsx` 하나에 6개를 export한다.
  - 160×120 인라인 SVG, `aria-hidden`(제목과 덱이 의미를 맡는다).
  - 선은 `.dg-line`(`--stroke-pen`, `--line-control`), 강조는 요소 1개만 `.dg-accent`(`--stroke-accent`, #084734). 채움·배경 원·그림자는 0이다.
  - 캐릭터, 이모지, 손그림은 금지다.
  - 소비처는 controls §3.10의 `StateBlock`(H1 → 덱 → 복구 링크 3개, Kicker 없음)이다.
- **ai-report 선화 3장**(`benefit-archive/evidence/time.png`)은 도해 정본으로 그대로 둔다(C26). 새 선화는 이 어휘를 따른다.
- **블로그 기본 썸네일 12장**: 800px webp q80, 장당 40KB 이하로 다시 내보낸다. 폴백(`BlogThumb.tsx`의 `#ECFDF5` + 아이콘)은 `bg-surface-sunken` + 스팟 선화로 바꾼다. 블로그 세션이 커밋된 뒤 진행한다.
- **블로그 본문 이미지**는 Figure·Frame과 같은 도판 현상(§3-3, MO-4)을 쓴다: 자리표시 + decode 전 이미지만 `--motion-slow` opacity(로딩 상태 한정). JS 마운트 뒤 `img.complete === false`일 때만 `data-loading`을 달고, decode가 끝나면 `data-loaded`로 바꾼다. SSR과 JS 없음에서는 불투명 1이다. 블로그 글 표지는 plate 1장까지다(P5).
- **동의 배너 크레용 쿠키**는 lucide `Cookie` `size-6` `text-fg-muted`로 바꾸거나 삭제한다(icons와 공동).

### 3-14. 사례 배치와 캐러셀 (X06, 소유)

**홈은 캐러셀이 아니다**(V10-A · 2026-10-28). 홈 '05 기록'의 사례는 3건을 정적으로 둔다: 64rem 이상 3열, 모바일 세로. 사진은 `aspect-case` Figure(r0)이고, 사진이 없으면 사진 칸을 뺀 형태다(§3-4). 지금 `CaseStudies`의 8.5초 자동 넘김은 삭제한다(C07 자동 진행 0). 캐러셀은 사례가 4건 이상인 목록 지면에서만 쓴다.

| 상태(목록 지면 캐러셀) | 값 |
|---|---|
| 활성 `data-pos="active"` | opacity 1 |
| 이웃 `data-pos="near"` | opacity .72, `.case-body` opacity 0, 안쪽 래퍼에 `inert` |
| 나머지 `data-pos="far"` | opacity 0, pointer-events none, 안쪽 래퍼 `inert` |
| 넘김 | 수동만. 자동 넘김 0(`setInterval` 삭제) |
| 이동 | transform `--motion-base` 320ms `--ease-soft`, scale 0. reduced에서는 즉시 이동 |
| 사진 | `aspect-case`, 카드 안 Figure(`inCard`, r0, 카드도 r0). 라벨 캡션은 `.case-body` 밖에 둔다. 이웃 슬라이드에서도 사진과 라벨이 같이 보이게 하기 위해서다 |

슬라이드 위치 계산, 사례 카드 구조(dl 4칸 등)와 인용은 cards_motion이 소유한다. 캐러셀 구현은 위 `data-pos` 속성과 site-base.css의 `.case-slide` 규칙을 쓴다.

---

## 4. 사용 규칙과 대상 파일

| 파일 | 지금 | 바꿀 것 |
|---|---|---|
| `components/sections/Header.tsx:62-70` | `logo.png` `priority` + `loading="eager"` | 둘 다 삭제한다(로고는 LCP가 아니다). 단색 마크 교체는 icons 소관 |
| `components/sections/Hero.tsx` | sticky 다크 영상, 스크림 3겹, 숨김 컨테이너 `priority`, 파란 지구 포스터·하단 섹션(같은 파일 2회), alt 불일치 | **V11-A → V3-A**(P3): 영상·스크림·`HERO_VIDEO_MEDIA_QUERY`를 삭제한다. LCP 요소는 H1이다.<br>• **출처를 확인한 3-6a-① 캡처가 커밋되기 전**: 무도판 비대칭 표지다. H1은 1–9칸에 크게 짜고, 덱과 CTA 두 개는 8–12칸, H1 마지막 줄 아래에 둔다. Hero 안 Figure/Frame은 0이고, 현 `hero-dashboard.webp`는 포스터와 본문 도판 모두 내린다. 출처 미확인 도판에는 어떤 라벨도 짐작해 달지 않는다(V11-A · 2026-10-28, V3 보충 문장 교체도 함께 승인)<br>• **캡처 커밋 뒤**: V3-A 7/5 분할. ≥64rem에서 오른쪽 5칸(M)에 capture Frame(EDB 판서 16:10, r0, 매트, 그림자 0, 캡션 `실제 화면 · YYYY.MM 캡처`)을 둔다<br>• `sizes="(min-width:1280px) 480px, (min-width:1024px) 36vw, calc(100vw - 32px)"`<br>• 데스크톱은 eager(preload 없음), 모바일은 lazy(IM-3)<br>• 같은 이미지 파일은 페이지당 1회(배경·포스터 포함) |
| `components/media/HeroVideoBackdrop.tsx` | 정지 없음, `<video poster>`, saveData만 확인 | §3-11: `children` API, `data-media-toggle` 버튼, `LOOP_MEDIA_QUERY`, IO·hidden 정지, poster 속성 삭제 |
| `components/sections/DashboardPreview.tsx` · `DashboardPreviewCharts.tsx` | `'use client'`, `dynamic(ssr:false)` Recharts, 그라데이션·오브·글래스, 가공 선 | 홈 목차에서 빠진다(V10-A, P3). 다른 사용처가 0이면 두 파일과 `shouldLoadCharts`, `DashboardChartsSkeleton`을 삭제한다. 공개 recharts import 0 |
| `components/sections/ProblemCost.tsx:76-83,152-245` | 노이즈·블롭, 리스크 대시보드 | 삭제하고 홈 '02 공감' 정성 장부로 바꾼다(C08, cards_motion). 행 이름·순서는 `OS_MODULES`(= C08 6행: 칠판·교안·녹화·LMS·학생 관리·관리자 데이터)이고 '03 흐름' 지도와 ○→● 콜백을 만든다(MO-2) |
| `components/sections/SatisfyingClass.tsx:48-200` | 회전 콜라주 | 홈 목차에서 빠진다(V10-A). 회전 콜라주 이미지를 다른 곳으로 옮기지 않는다 |
| `components/sections/ScienceBased.tsx` | 노이즈·블러, 대형 초상 `fill` + `sizes` 없음, Freeman 사진 | 홈에서 빠지고 각주 단 블로그 글로 옮긴다(V10-A). 에빙하우스·Freeman 초상 2장은 삭제하고 대체 이미지를 넣지 않는다(IM-8). 망각 곡선 차트는 원문 대조 뒤 그 블로그 글에 넣는다 |
| `components/sections/KeyUseCases.tsx` | 생성 오버레이 5장, `#ECFDF5` 면, 블러, 회전 hover, `object-position` | SW 페이지로 옮긴다(V10-A, P4). 탭마다 영역 capture Frame 1개(3-6a-②, 매트), `sizes="(min-width:1024px) 640px, calc(100vw - 32px)"`. 비활성 탭 패널은 마운트하지 않는다. 탭 안이라 번호는 없다. 나머지는 삭제한다 |
| `public/images/.../admin-dashboard-source-2.webp` | 블러 마스킹, IP 노출. 정적 랜딩 `public/l/*`(`scripts/generate-segment-landings.mjs:2280,2354,2418`)에서 쓴다 | 즉시 노출을 중단한다(H). `/l/*` 참조도 함께 내리고, 단색(`--surface-skeleton`) 마스킹 캡처(3-6a)로 바꾼다 |
| `admin-dashboard-source-1` | 블러 마스킹만, 홈·SW 사용 | 단색 마스킹 캡처로 바꾼다(H) |
| `components/sections/CaseStudies.tsx` | 비율 혼재, `h-44` cover, `unoptimized`, 실명 파일명, 8.5초 자동 넘김 | 홈 '05 기록'에서 3건 정적 배치(§3-14, V10-A). §3-4 판정표. `aspect-case`, `case-{지역}-{nn}.g1.webp`, alt는 장면 서술, `unoptimized` 삭제. online-12inedu는 capture로 재분류 |
| `components/sections/SolutionOverview.tsx:111` | 먹 패널 | `LessonOsMap className="pattern-grid"`(§3-9). 섹션은 sunken(C19) |
| `components/sections/FinalCTA.tsx:13-15`, `ProblemCost.tsx:82`, `ScienceBased.tsx:11` | `noise-texture.svg` + 블러 글로우 | 삭제한 뒤 SVG 파일도 지운다 |
| `app/product/hw/page.tsx:246` | 중국어 EEO 포스터(`feature-writing.webp`) | 3-6a-① EDB capture Frame(매트). 3-6b 뒤에는 판서 사진 |
| `hw/page.tsx:495-512, 728-735` | 사진 + 먹 70%·`from-black/65`. `FullWidthPointSection`(:497-507)은 `sizes="100vw"` 풀블리드 | 오버레이를 삭제하고 배지는 캡션으로 옮긴다. `FullWidthPointSection`은 풀블리드를 폐기하고 콘텐츠 폭 plate(L)로 바꾼다(P4) |
| `hw/page.tsx:1131-1146` | 그라데이션 액자·글로우, 포스터·정지 없음 | Figure 16:9 r0 + 지정 프레임 포스터 + 정지 버튼 |
| `components/product/hw/BigBackdropImage.tsx` | `useScroll` scale, `from-black/85`, `sizes` 없음 | §3-12: 풀블리드 폐기 → 콘텐츠 폭 plate(L), 카피를 plate 아래 paper로, 스크림 0, 아트 디렉션 2컷(16:9 / 4:5) |
| `components/product/hw/LatencyProof.tsx` | 오렌지 연필, `#0D1A12` 상자, 글래스 배지, 경쟁 행 | 감사 D5 확정 뒤 BarList(측정 정의 각주) + `[data-seq]` opacity 등장(C06). 경쟁 행 삭제. 그 전에는 정적 텍스트로 두거나 이미지 없이 간다. 도해 작도는 §3-9(SY-3) |
| `components/product/hw/AllInOneStatement.tsx:19-41` | `#010302`, 글로우, 마스크, `mix-blend-screen` | HW 유일한 먹 장(CO-8, P4). OPS 컷아웃 한 컷을 `--surface-ink` 값 #1A1917 판에 미리 합성한 webp(§3-5 먹 판) + capability hair 행 목록. 블렌드·마스크·글로우 삭제. 출처 미확인이면 타이포 먹 + 행 목록 |
| `components/product/hw/AICameraSection.tsx` | sheet 섹션, 네이비 글로우 카메라 렌더(다크 키) | paper 위 밝은 판(§3-5) 제품 도판으로 옮긴다(CO-8, P4). 출처 미확인이면 사양표·텍스트 |
| `components/product/hw/SizeChooser.tsx:87` | `#ECFDF5` 그라데이션, 스톡 | sunken 면 + 65/75/86/110 실제 비율 외곽선 펜 도해 |
| `components/product/hw/DesignDetails.tsx:20-38` | 추상 렌더 | 제품 판 도판(CO-7·IM-5: 제조사 원본 렌더·CAD 재조명, 막히면 스튜디오 촬영 1일)이나 3-6b 매크로 사진을 쓰거나 이미지 없이 간다 |
| HW 렌더 전반(`public/images/product/hw/*`) | 렌더되는 21개 중 5개가 생성 스크립트 출력명과 같고(git 기록상 3개 Gemini 생성), 16개는 출처 기록 없음. 시네마틱 다크 렌더·우주 화면 | 장부 1차 검증 전에는 '제품 렌더' 라벨을 달지 않고, 기존 렌더를 그대로 컷아웃해 재사용하지 않는다. 시네마틱 다크 렌더·우주 화면은 퇴역한다(P4, 대체 전 빈 Frame 0) |
| `public/images/product/hw/spaces/*` | 생성 장면으로 보임[추정], 제품이 보임. `space-s75`·`space-s86`은 /checkout 동결 파일 | 공개 페이지에서는 장부 검증 전 사용을 멈춘다. 생성으로 확인되면 **교체하거나 삭제**한다(제품이 보이는 생성 이미지는 라벨로 해결할 수 없다). /checkout 동결 파일은 지우지 않고, 라벨·교체는 운영자가 정한다(§3-1) |
| `app/product/sw/page.tsx:1591-1600` | 서양 스톡 포스터(페이지에 두 번) + 그라데이션 2겹. 영상은 이미 쿼드러닝 클립(1080p) | 클립 권리를 장부에서 확인한 뒤 `sw-classroom-loop.g1.mp4`의 지정 프레임(`posterAt`) 포스터로 바꾼다(사진과 같은 그레이드, IM-9, P4). 영상 위 글자는 `bg-surface-scrim` 1겹. 권리가 없으면 영상·스톡을 내리고 텍스트 히어로 |
| `sw/page.tsx:1048-1056` | `smartroon` + 그라데이션 | 장부에서 출처를 확인한 경우에만 `제품 렌더` Figure, 또는 실사 |
| `sw/page.tsx:1272,1276` | 노이즈 + 800×500 블러 | 삭제 |
| `sw/page.tsx:1808-1822` | 스톡 위 '실제 수업 화면' 배지 | 실제 영상일 때만 캡션 `실제 화면` |
| `sw/page.tsx:1904-1910` | 활동 PNG `unoptimized` | icons의 라인 글리프로 바꾼 뒤 PNG 삭제 |
| `sw/page.tsx:2003-2016` | 세계지도 펄스 | 삭제하고 `ScaleFacts` 텍스트(factId, system §7)로 바꾼다 |
| `sw/page.tsx:2083-2141` | 분석 목업(집중도·발언·부유 A+ 링) | Frame(mock) + LineChart 1개 `주차별 과제 제출률`(example). 집중도·발언 지표는 검증 전 금지 |
| `app/product/ai-report/page.tsx` | `#ECFDF5` 면(:662 등), 10px `#A39E98` 라벨(:589), '자동 녹화 중' 무한 점멸(:472), 무한 웨이브폼(:600), 16:10 원본을 16:9 슬롯에 | 구조·레이아웃·카피는 그대로 두고 토큰 퇴역만 적용한다(C26).<br>• 면 → `bg-surface-paper`<br>• 목업 영역 → Frame(mock)<br>• 10px `#A39E98` 예시 라벨 → Frame 안 점선 태그 `예시 화면`(C05·C26). muted 글자 캡션으로 남기지 않는다<br>• 점멸 → 정적 `status-dot` + `자동 녹화`<br>• 웨이브폼 → 정적 막대<br>• 슬롯 → `aspect-screen`<br>• `OutlineIcon` → IconFrame(icons)<br>• 선화 3장은 유지 |
| `app/about/AboutPageClient.tsx` | 무음 72초 자동재생 루프 + 영상 위 글자, 스톡 6장(culture 3 + partnership 3, 커밋 `cd9803d2`가 classin.com 공식 사진·사용 허락으로 기록) | 내용 영상(§3-11). 제목은 영상 아래로 옮긴다. 스톡 6장은 장부 `origin`에 `cd9803d2` 근거를 적는다. 스톡 인물은 P5에서 퇴역하고 동의받은 지사 사진(`사진 · 클래스인코리아`) 1장이나 텍스트로 바꾼다(IM-8). 여백 칸 캡션(TY-8)을 쓴다 |
| `app/docs/_utils.tsx:156-193` | `unoptimized`(로컬 전부), SVG 축소 | `unoptimized` prop을 삭제한다(Next 16 기본 로더가 `.svg`를 그대로 서빙, `get-img-props.js:278`). `DOC_DIAGRAMS` 레지스트리 |
| `app/events/[slug]/page.tsx:250-261` | r22/28 + shadow, `NEUTRAL_BLUR_DATA_URL` | Figure r0, 그림자 0, `fig-edge`, `bg-surface-skeleton` 자리표시. blur placeholder를 삭제한다 |
| `lib/image-blur.ts` | `#ECECEA` blur 데이터 URL(사용처는 events 1곳) | 사용처가 0이 되면 파일을 삭제한다 |
| `components/blog/BlogThumb.tsx`, `public/images/blog/` | `#ECFDF5` 폴백, 썸네일 무게 | §3-13. 블로그 세션 커밋 뒤 |
| `app/not-found.tsx` 등 상태 화면 | 제각각 | `StateBlock` + 스팟 선화(§3-13) |
| `components/consent/ConsentBanner.tsx` | 크레용 쿠키 이미지 | lucide `Cookie` 또는 삭제 |
| `next.config.ts` | AVIF·WebP, immutable | 변경 없음. 교체 파일은 새 이름으로 넣는다 |
| `docs/hw-intro-visual-plan.md` | `#ECFDF5`·`#0D1A12`·글로우·3D | 머리에 '대체됨' 표기 |
| `public/l/online/index.html`, `public/l/kids/assets/bg/*.png` | 9.5MB GIF, 약 20MB PNG | **백로그**: growth-crm 랜딩 이관 때 처리한다. 랜딩별 최근 4주 리드 기준선을 잡은 뒤 GIF는 MP4(무음, 1MB 이하) + 포스터로, PNG는 webp 장당 150KB 이하로 바꾼다. 단, `public/images` 미참조 정리 스캔에는 `public/l/*`와 `scripts/generate-segment-landings.mjs`의 참조를 포함한다(정리 때 랜딩 이미지를 '미참조'로 오인해 지우지 않는다) |
| `lib/billing/hardware-catalog.ts:109,122,134,148` | /checkout 이미지 4파일 참조 | 변경 없음. 4파일은 장부 `frozenBy: "checkout"`과 존재·해시 테스트로 동결한다(H, §3-1) |

**도판 예산**(system §6 `--budget`이 빌드 HTML에서 센다)
- 섹션당 Frame(`[data-frame]`) 1개 이하. sheet는 섹션 지면이 아니다(C19).
- plate(`[data-plate="L"]`): 홈 0 · SW ≤1 · HW ≤2 · 블로그 글 표지 1.
- 같은 이미지 파일은 페이지당 1회(배경·포스터 포함).
- 식별 가능한 얼굴은 페이지당 1개 이하이고, 각각 장부 `consentDocId`가 있다.
- 페이지당 `.pattern-grid` 1개 이하.
- 페이지당 차트 등장 1개(`[data-seq]`를 담은 `[data-reveal]` 1개). 홈은 0.
- 섹션당 주석 0–1개, capture Frame에만.
- 먹 지면 위 이미지는 HW OPS 컷아웃 1장뿐이다.
- 홈 Hero 안 `[data-figure]`·`[data-frame]`은 출처 확인된 캡처가 커밋되기 전까지 0이다.

---

## 5. 접근성·대비

**대비**: WCAG 2.x, [측정]. 지면 값은 V15-A(paper #F9F8F5 · sunken #F3F2EE · skeleton #EFEEE9)다. 순서는 흰 sheet / paper / sunken / skeleton이다.

| 요소 | 값 | 판정 |
|---|---|---|
| 캡션·눈금·주석 메모·비교 라벨 `#615D59` | 6.53 / 6.14 / 5.82 / 5.62 | AA 본문 통과. P2 게이트 muted ≥5.5(밝은 지면) 통과 |
| 정보선·○·점선 태그·리더선·비교 막대 `#8A857F` | 3.66 / 3.44 / 3.26 / 3.15 | 비텍스트 통과. **skeleton 위 금지**(자리표시 면), 글자 금지 |
| `#A39E98` | 2.66 / 2.50 / 2.37 / 2.29 | 글자·정보선 금지(장식 전용) |
| 강조 `#084734` | 10.71 / 10.08 / 9.56 / 9.22 | 통과 |
| 헤어라인 `.08` | 1.18 | 장식·경계만 |
| 정지 버튼(line, 영상 박스 밖) 아이콘 `#111110` on paper | 17.79 | 통과 |
| 정지 버튼 테두리 `#8A857F` | — / 3.44 / 3.26 | 비텍스트 통과(paper·sunken). P2 게이트 조작 경계 ≥3.2 통과 |
| 포커스 outline `#084734`(전역 보증 ① 하나) | — / 10.08 / 9.56 | 통과 |
| 스크림 .48 위 `#FAFAF8` | 모든 프레임에서 3.19 이상 | 큰 글자 통과 |

대비 값은 `tests/design/surface-contrast.test.ts`가 지킨다(P2 게이트: 조작 경계 ≥3.2 · muted ≥5.5 · 먹 위 읽는 글자 ≥4.5).

**alt**
- 사진: `[누가] [무엇을] 하는 [어디] 장면`, 80자 이하.
- 화면: `[화면 이름] 화면: [핵심 1줄]`.
- 장식: `alt=""`.
- 금지: '…사진', '…이미지'로 끝나는 alt, 영어·브랜드명만 있는 alt, 내용과 다른 alt(예: `Classin Education Dashboard`).

**구조**
- **차트**: `<figure>` + H3 제목 + sr-only 전체 표. SVG는 `aria-hidden`이고 직접 라벨에 끝값을 넣는다.
- **목업**: 본문 `aria-hidden` + sr-only `예시 화면: …`(모든 수치 포함).
- **도해**: HTML 텍스트이거나, 인라인 SVG면 `role="img"` + `aria-label`.
- **주석**: <64rem에서 `<ol type="a">`가 의미를 전달하고 마커는 `aria-hidden`이다.
- **영상**: 정지 버튼(2.2.2), 무음 내용 영상은 텍스트 요약(1.2.1), 음성 있는 영상은 자막(1.2.2), 장식 루프는 `aria-hidden`.
- **고대비**(`forced-colors`): 강조 `Highlight`, 비교 `GrayText`, 도해 정보선 `CanvasText`.
- 도판 안 읽는 글자(도해·목업·차트의 HTML·SVG 글자)는 렌더 13px 이상이고 `--fg-muted` 이상이다.
- 화면 캡처 속 UI 본문 글자는 64rem 이상에서 렌더 10px 이상이다(판독 하한, IM-4).

**동작 줄이기 / JS 없음**
- 영상: `<video>`를 만들지 않고 포스터만 보인다.
- 차트 `[data-seq]`: 무장하지 않아 완성 상태다.
- ●점등: 최종 상태다(● 6개, cards_motion).
- 캐러셀: 이동이 즉시 일어난다.
- 도판 현상(Figure·Frame·블로그 본문): 없다. 처음부터 불투명 1이다.
- 모든 도판·Frame·도해·차트가 SSR HTML로 완성 상태다.

---

## 6. 성능 예산

| 항목 | 상한 |
|---|---|
| 마스터(repo) | Hero 도판 1920px·400KB, 카드 1600px·320KB(q88), 초상 600px·90KB, 블로그 썸네일 800px·40KB, SVG 15KB(래스터·필터·폰트 내장 0) |
| 전달(DPR2 모바일 슬롯) | LCP 이미지 120KB, Hero capture 모바일 120KB, 카드 80KB, plate(L) AVIF 1200w 200KB, 썸네일 40KB |
| 페이지 이미지 합(390px, 끝까지 스크롤) | 홈 900KB, 제품 1.2MB, 블로그 목록 600KB, 문서 글 1장당 300KB |
| `preload`·`fetchPriority="high"` | Header 0개. 본문은 라우트당 실제 LCP 후보 1개. 숨김 조상 아래와 첫 화면 아래에는 0. 홈은 LCP가 H1이라 이미지 preload 0이다(Hero capture는 데스크톱 eager·preload 없음, 모바일 lazy, IM-3) |
| `priority` | 0(Next 16 deprecated) |
| `sizes` | `fill`이면 100% 지정. 콘텐츠 이미지의 `100vw`는 0(풀블리드 폐기). 표준 문자열:<br>• plate(L) `(min-width:1280px) 1200px, calc(100vw - 32px)`<br>• Hero 5칸 `(min-width:1280px) 480px, (min-width:1024px) 36vw, calc(100vw - 32px)`<br>• 2열 `(min-width:1024px) 584px, (min-width:768px) 50vw, calc(100vw - 32px)`<br>• 3열 `(min-width:1024px) 384px, (min-width:768px) 50vw, calc(100vw - 32px)`<br>• 문서 `(min-width:1024px) 720px, calc(100vw - 32px)` |
| `unoptimized` | 0 |
| 영상 | 홈 0. 루프는 5MB·2.5Mbps·720p·오디오 0. 터치 기기와 64rem 미만에서 영상 요청 0 |
| GIF | 공개 앱 0(`/l/*`는 백로그) |
| 차트 JS | 공개 라우트 `recharts` import 0, 차트 클라이언트 코드 0(Reveal만) |
| CLS(이미지 원인) | 0 |
| 런타임 효과 | 이미지에 `filter`·`mix-blend-*`·`backdrop-filter`·`drop-shadow-[]` 0 |
| 저장소 | 미참조 이미지 65개(약 25.9MB)와 `*-generated-v3` 변형은 grep 0건을 다시 확인한 뒤 삭제(IM-2, P2). 스캔 범위에 `public/l/*`와 `scripts/generate-segment-landings.mjs`를 넣는다. /checkout 동결 4파일은 제외 |

---

## 7. 마이그레이션 (S/M/L)

각 단계는 커밋 1개다. 게이트는 typecheck → eslint → vitest → build(prebuild 가드 포함)이고, 수용 조건에 '어드민 무변경'과 '/checkout 이미지 4파일 존재'가 항상 들어간다. 단계 이름의 H·P0–P5는 고급화 기획 §8과 system §11 롤아웃 단계다(H 정직성 핫픽스 → P2-0 결정 기록 → P2 → P3 → P4 → P5).

1. **[S] 개인정보·정직성 즉시 조치**(H, P2 전·W0 핫픽스 뒤. main에서 별도 세션이 진행하고 이 문서는 기록만 한다)
   - `admin-dashboard-source-2`(블러, IP 노출)와 online-12inedu(참가자 블러 캡처) 노출을 중단한다. `public/l/*`(`scripts/generate-segment-landings.mjs:2280,2354,2418`) 참조도 함께 내린다. 블러만 된 `admin-dashboard-source-1`(홈·SW)은 단색 마스킹 캡처로 바꾼다.
   - 학생 얼굴이 식별되는 사례 컷은 감사 D4 확인 전 노출 중단(운영자 승인 후 적용).
   - DashboardPreview와 SW 분석 목업에 '예시' 표기를 단다. '지역 평균' 가공 선을 삭제한다.
   - ai-report 10px `#A39E98`(2.44:1) 예시 라벨을 Frame 안 점선 `예시 화면` 태그(C05·C26)로 바꾼다. Frame 프리미티브(4단계) 전이면 §3-7 'mock 표식' 클래스 문자열을 그대로 쓰고, 4단계에서 Frame(mock)으로 옮긴다.
   - /checkout이 쓰는 이미지 4파일(`lib/billing/hardware-catalog.ts:109,122,134,148`)을 동결 가드(존재·해시 테스트)로 막는다.
   - 스펙 문서에서 Hero 도판에 생성 라벨을 달라는 지시 8곳(이 문서 4곳 포함)을 지운다. 출처 미확인 도판에는 어떤 라벨도 짐작해 달지 않는다.
   - 게이트: 하이드레이션 뒤 렌더 텍스트를 저장소 의존성 밖 브라우저 도구로 검사한다(소스 정규식은 쓰지 않는다). `/admin`·`/checkout` 스크린샷 차이 0.
   - 파일: `KeyUseCases.tsx`, `CaseStudies.tsx`, `DashboardPreview*.tsx`, `sw/page.tsx`, `ai-report/page.tsx`, `public/l/*`, `scripts/generate-segment-landings.mjs`, `tests/`(동결 테스트)
2. **[S] next/image 위생**(P0, 화면 변화 거의 0)
   - `unoptimized` 3곳을 삭제한다(docs 포함).
   - `sizes`가 없는 `fill` 3곳에 `sizes`를 넣는다.
   - Hero 숨김 컨테이너의 `priority`, Header 로고의 `priority`·`eager`를 삭제한다. 남는 `priority`는 `preload`로 바꾼다.
   - events의 blur placeholder를 지우고 `lib/image-blur.ts`를 삭제한다.
   - 파일: `app/docs/_utils.tsx`, `CaseStudies.tsx`, `sw/page.tsx`, `ScienceBased.tsx`, `BigBackdropImage.tsx`, `Hero.tsx`, `Header.tsx`, `app/events/[slug]/page.tsx`, `lib/image-blur.ts`
3. **[S] 토큰·유틸·컴포넌트 CSS**(P0 PR에 합침)
   - `tokens.css` `@theme inline`에 `--aspect-*` 3개를 넣는다.
   - `utilities.css`에 `fig-edge`·`chart-stroke`를 넣는다.
   - `site-base.css` components에 chart·dg·case-slide 규칙을 넣고(정지 버튼 전용 규칙은 없다, 포커스는 보증 ①), `[data-seq]` 박자(`--seq`) 규칙을 넣고, 단일 no-preference 블록에 도판 현상(블로그 포함)·case-slide·루프 영상 규칙을 합친다(`[data-seq]` 전이는 cards_motion §3-14 ④).
   - 화면 변화는 0이다(소비처가 아직 없다).
4. **[M] 출처 장부 + 프리미티브 Figure·Frame**(P2)
   - `data/image-credits.json`(§3-1 행 구조)과 빌드 가드(장부 미등록·`verifiedAt` 없는 새 도판 → 빌드 실패, 기존 미검증 도판은 래칫). /checkout 4파일 `frozenBy: "checkout"`.
   - `components/ui/figure.tsx`: `FigureSource`, `sourceLabel`(장부 행에서), Figure(`id` API, 크기 3단 `data-plate`, plate 아트 디렉션, 여백 칸 캡션), Frame(장부 `id`: capture 행 / mock 행 + 자식 목업 유니온, 매트 V16-A, r0, 점선 태그, sr-only 요약, `data-frame`), Annotation(≥64rem 리더선, <64rem a·b 목록).
   - 도판 현상(MO-4): AppChrome 공개 분기의 클라이언트 효과 1개, Figure는 서버 컴포넌트 유지. 블로그 본문 배선을 겸한다.
   - 테스트 `tests/ui/imagery.test.tsx` 하나: renderToStaticMarkup + `vi.mock("next/image")`(vitest 환경이 node). `@ts-expect-error`로 `id` 누락과 mock+annotations를 확인한다. plate가 kind `generated` 행을 거부하는지, mock에 캡션이 없는지, capture에 date가 있는지 확인한다.
5. **[M] 영상**(P4와 병행 가능)
   - 분류 표대로 처리한다. 루프 3개는 `-an`, 720p crf23, 그레이딩 필터(흰점 = paper), bt709 태그, `*.g1.mp4`, 지정 프레임(`posterAt`) 포스터로 만든다. 브랜드 필름은 controls + 포스터 + 장면 요약으로 바꾼다.
   - SW 히어로(IM-9): 쿼드러닝 클립 권리를 장부에서 확인한 뒤에만 쓰고, 서양 스톡 포스터(페이지 2회)를 지정 프레임 포스터로 바꾼다. 권리가 없으면 영상·스톡을 내리고 텍스트 히어로.
   - `HeroVideoBackdrop`: `children` API, `data-media-toggle` 버튼(상태 파생), `LOOP_MEDIA_QUERY`, IO·hidden 정지, `<video poster>` 삭제.
   - HW 영상을 Figure + 정지 버튼으로 바꾼다.
   - 파일: `scripts/media/encode-video.sh`, `public/video/`, `components/media/HeroVideoBackdrop.tsx`, `app/product/sw/page.tsx`, `app/product/hw/page.tsx`, `app/about/AboutPageClient.tsx`
6. **[S] 3-6a 실제 화면 재캡처**(규격 P2 → 캡처 P3–P4, 외부 담당)
   - 전체 캡처(EDB 판서 1920×1200)와 영역 캡처(720×450 CSS px @2x = 1440×900: KeyUseCases 4장, 홈 '04 화면' 1장, 가능하면 AI 리포트)를 찍는다. 라이트 테마·한국어 시드·창틀/커서/알림/딤 0, 마스킹은 `--surface-skeleton` 단색, 그레이딩은 하지 않는다. 판독 하한(64rem 이상 UI 본문 10px)을 확인한다. 새 이름으로 `public/images/captures/`에 넣고 장부 행을 단다.
7. **[L] 3-6b 하루 촬영 12컷과 감사 D4 동의 게이트**(P5, 외부 의존)
   - 대상 학원 1곳과 동의서·초상 동의를 확보한다. §3-6b 샷리스트 12컷을 같은 날 단일 색온도로 찍는다.
   - 기존 사례 7곳의 공개·초상 동의 여부를 감사 D4 표로 확정한다. 이 게이트를 통과한 사진만 9단계 대상이다.
8. **[M] 오프브랜드 이미지 퇴출**(P1 빼기 → 남은 것은 해당 라우트 PR)
   - 대체가 필요 없는 것은 바로 삭제한다: KeyUseCases 생성 오버레이·`#ECFDF5` 면·블러·회전 hover, 노이즈 SVG 3곳·블러 글로우, SW 세계지도 펄스·SW 블러, ScienceBased 초상 2장(에빙하우스·Freeman, IM-8).
   - 6단계 뒤에 바꾸는 것: KeyUseCases 영역 capture Frame 4개(SW로 이동), HW 중국어 포스터 → EDB capture.
   - SW 히어로 포스터 → `sw-classroom-loop` 지정 프레임(5단계 뒤, 클립 권리 확인 뒤).
   - About 스톡 인물은 P5에서 지사 사진 1장 또는 텍스트로 바꾼다(장부 `origin`에 `cd9803d2` 근거).
   - HW 공간 사진과 출처 기록 없는 HW 렌더는 장부 1차 검증 결과에 따라 교체하거나 삭제한다. /checkout 동결 파일은 지우지 않는다.
9. **[M] 그레이딩·사전 크롭**(P3, 7단계 게이트 뒤. 1차는 대구·천안·대치 3장, IM-6)
   - `grade-photos.mjs`(중립 패치 WB → 공통 그레이드, 흰점 = paper, assert 포함)를 만든다. 저장소 의존성 밖에서 실행한다. 게이트를 통과한 사례 사진을 3:2로 자른다(손실 16% 이하, 업스케일 0, 미달 컷은 사진 없이). 세트 R−B 폭 ≤4를 확인한다.
   - `case-{지역}-{nn}.g1.webp`로 넣고 실명 원본 3장은 삭제한다.
   - CaseStudies: 홈 '05 기록' 정적 3건(§3-14), `aspect-case`, alt 장면 서술(cards_motion 커밋과 함께).
   - online-12inedu는 단색으로 재마스킹해 capture로 쓰거나 제외한다.
10. **[M] Hero 표지**(P3 Hero)
    - 10a. V11-A 무도판 표지(6단계와 무관): 영상 Hero 경로, 스크림, `HERO_VIDEO_MEDIA_QUERY`, `home-hero.mp4`를 삭제하고, 같은 커밋에서 `hero-dashboard.webp`(포스터·본문 2회)를 내린다. H1 1–9칸, 덱·CTA 8–12칸, Hero 안 Figure/Frame 0, LCP = H1. 출처 미확인 도판을 대체 전까지 남기지 않는다(V11-A가 '대체 먼저' 원칙의 예외다. V3 보충 문장 교체도 V11-A로 승인됐다, 2026-10-28).
    - 10b. 캡처 커밋 뒤(6단계 뒤, IM-3): V3-A 7/5로 바꾼다. 오른쪽 5칸에 capture Frame(매트, r0), 데스크톱 eager·preload 없음, 모바일 lazy. 같은 커밋에서 장부 행을 단다.
11. **[M] 서버 차트**(P3–P4)
    - `components/charts/` LineChart·BarList·types(Y 4–96% 매핑, 라벨 9% 밀어내기, `[data-seq]` 3레이어 `--motion-slow` `--ease-fade`·간격 `--motion-beat`, sr-only 표, `ChartTruth`). KpiSpark는 사용처가 생길 때 만든다.
    - DashboardPreview는 홈에서 빠진다(V10-A). 다른 사용처가 0이면 `DashboardPreview*.tsx`와 recharts import를 삭제한다(패키지는 어드민용으로 남긴다).
    - SW 분석 목업을 서술형 차트 1개로 바꾼다. 망각 곡선은 원문 대조 뒤 블로그 글에서 별도 커밋이다.
    - 테스트는 4단계의 `tests/ui/imagery.test.tsx`에 케이스를 더한다.
12. **[M] 수업 OS 지도**(P3 '03 흐름')
    - `lib/classin-positioning.ts`에 `OS_MODULES`·`OS_PHASES`·`OS_OUTSIDE`를 둔다.
    - `LessonOsMap`(HTML·CSS 선, 3열/1열, 점선 '연동 범위' 줄, 노드·바깥 줄 r0, `os-node`/`--i`/열 `data-phase`·`data-current` 훅)을 만든다.
    - SolutionOverview(`pattern-grid`), `/product`, ai-report에 적용한다. '02 공감' ProblemCost 장부도 같은 상수를 쓰고, 라벨 배열 동일성 단위 테스트로 ○→● 콜백(MO-2)을 지킨다.
13. **[M] docs 도해**(P5)
    - `DOC_DIAGRAMS` 레지스트리, LessonOsMap 재사용, 인라인 SVG 3종(넓은 판 640 `md:` / 좁은 판 328).
    - Malgun Gothic·Apple SD Gothic Neo 대체 글꼴에서도 박스가 넘치지 않는지 확인한다.
    - public SVG 4개를 grep 확인 후 삭제한다.
14. **[L] HW 페이지 이미지**(P4)
    - BigBackdrop·FullWidthPointSection: 풀블리드 폐기 → 콘텐츠 폭 plate(L, 스크롤 scale 삭제, 아트 디렉션 2컷, 카피를 plate 아래 paper로). HW plate ≤2.
    - 제품 판 도판(CO-7·IM-5): 16:10 밝은 판(sunken 값), 좌상 키 라이트, 구운 접지 그림자 1개, '제품 렌더', r0. 조달은 제조사 원본 렌더·CAD 재조명, 막히면 스튜디오 촬영 1일. 출처가 확인되지 않은 렌더는 판에 올리지 않고, 새 파일명을 쓴다(/checkout 파일 사용 0).
    - AllInOne 먹 장 OPS 한 컷(CO-8, 먹 판 #1A1917, α ≤ .12) + capability hair 행 목록. AICamera는 paper 위 밝은 판.
    - 시네마틱 다크 렌더·우주 화면 퇴역(대체 전 빈 Frame 0, 사양표·텍스트로 무게 유지). SizeChooser 펜 도해, DesignDetails 제품 판 도판·매크로 사진 또는 이미지 없음, 시나리오 사진 오버레이 삭제.
    - LatencyProof는 감사 D5 뒤 BarList + opacity 등장.
15. **[S] ai-report 토큰 퇴역**(P4, C26)
    - `#ECFDF5` → paper, 목업 → Frame(mock), 무한 점멸·웨이브폼 → 정적, 10px `#A39E98` 예시 라벨 → 점선 `예시 화면` 태그(C05·C26), `aspect-screen`.
16. **[S] 선화·상태 화면**(P5)
    - `components/diagrams/spots.tsx` 6종, `StateBlock` 연결(controls), 동의 배너 쿠키 교체.
    - 블로그 썸네일 재수출·폴백·본문 이미지 페이드는 블로그 세션 커밋 뒤에 한다.
17. **[S] 저장소 무게**(P2, 장부와 같은 때)
    - 미참조 이미지 65개(약 25.9MB)와 `*-generated-v3` 변형을 grep 0건 재확인 후 삭제한다. 스캔에 `public/l/*`와 `scripts/generate-segment-landings.mjs`를 넣고, /checkout 동결 4파일은 제외한다.
18. **[S] 문서와 가드**
    - DESIGN.md 절 추가와 감사 문서 동기화(§9), `hw-intro-visual-plan` 대체 표기.
    - system §6 규칙 배열(`scripts/check-design-tokens.mjs`, 정규식, warn → error 래칫)에 아래 규칙을 넣는다. ✓ 표시는 system 1차 목록에 이미 있는 것이다.

| id | 패턴(요지) | 대상 |
|---|---|---|
| img-unoptimized | `\bunoptimized\b` | 공개 glob |
| img-fill-sizes | `<Image\b(?=[^>]*\bfill\b)(?![^>]*\bsizes=)[^>]*>`(s 플래그) | 공개 glob. `>`가 든 표현식은 놓칠 수 있으니 리뷰로 보완 |
| img-priority | `<Image\b[^>]*\bpriority\b` | 공개 glob |
| img-header-preload | `preload\|fetchPriority` | `components/sections/Header.tsx` |
| video-poster | `<video\b[^>]*\bposter=` | 공개 glob |
| img-effects | `mix-blend-\|backdrop-blur\|backdrop-filter\|drop-shadow-\[\|grayscale\|sepia\|hue-rotate` | 공개 glob |
| gif | `\.gif\b` | 공개 glob |
| chart-gradient | `<(linear\|radial)Gradient\b` | `components/charts/**`, `DashboardPreview*` |
| dashoffset ✓ | `stroke-dashoffset\|draw-path` | 공개 glob |
| recharts ✓ | `from "recharts"` | 공개 glob |
| credit-placeholder ✓ | `credit:\s*["'][^"']*○○` | 공개 glob |
| hex ✓ | hex 리터럴(`#A39E98` 선·`#ECFDF5` 면 포함) | 공개 glob |
| img-ledger | Figure/Frame `id`가 장부에 없거나 `verifiedAt`이 없음. 새 도판은 처음부터 error, 기존 미검증 도판은 래칫 | 공개 glob + `data/image-credits.json` |
| img-sizes-100vw | `sizes=["']100vw` | 공개 glob(콘텐츠 이미지). 풀블리드 폐기 |
| img-radius | 도판·Frame·매트·도해 노드·차트 막대의 `rounded-*`(허용목록 방식, V14-A. 반경 가드 정본은 cards_motion·system) | 공개 glob |
| checkout-frozen | /checkout 4파일 존재·해시(테스트) | `public/images` |

빌드 HTML 예산(`--budget`)에 더한다: `[data-plate="L"]` 라우트별 상한, 같은 이미지 파일 페이지당 1회, 홈 Hero 안 `[data-figure]`·`[data-frame]` 0(캡처 커밋 전).

---

## 8. 수용 기준

스크린샷·computed style·뷰포트별 개수 검사는 iPhone 실기기와 Windows Chrome 1366×768 DPR1 두 환경에서 하고, 저장소 의존성 밖 브라우저 도구로 돌린다(새 devDependency 0, SY-1).

**next/image·LCP**
- 공개 코드(`app`·`components`·`lib`, 어드민 제외)에서 `unoptimized` 0건, `priority` 0건, `sizes` 없는 `fill` 0건이다(가드와 현재 3건 대조).
- Header·레이아웃의 이미지 `preload|fetchPriority="high"`가 0건이다. 본문은 라우트당 1건 이하이고, 숨김 조상 아래에는 0건이다.
- 홈(V11-A → V3-A): 캡처가 커밋되기 전까지 Hero 안 `[data-figure]`·`[data-frame]`이 0이고 홈 전체에 `hero-dashboard.webp`가 0회다. 캡처 커밋 뒤에는 iPhone 13 에뮬레이션(390×844) 네트워크 탭에서 첫 화면 전에 Hero 도판 요청이 없고(lazy), 1440×900에서는 Hero 도판이 eager이며 이미지 preload가 0건이다. 두 폭 모두 Lighthouse LCP 요소가 H1이다.

**영상**
- ffprobe로 루프 영상 3개가 모두 1280×720 이하, 2.5Mbps 이하, 5MB 이하, 오디오 스트림 0, 색 태그 4종이 unknown이 아니고, 파일명이 ASCII 새 이름인지 확인한다.
- 포스터 일치: next/image 포스터와 인코딩 결과의 지정 프레임(`posterAt`, `ffmpeg -ss {posterAt} -frames:v 1`)을 같은 그레이드로 뽑았을 때 평균 절대 픽셀 차가 2% 이하다. `<video>`의 `poster` 속성은 0건이다.
- SW(IM-9): 첫 화면에 서양 스톡이 0이고, 포스터에 한국어 판서가 보이며, 포스터의 가장 밝은 중립 면 R−B가 4–8이다. 같은 포스터 파일은 페이지당 1회다. 클립 권리가 장부에 기록돼 있지 않으면 영상이 렌더되지 않는다.
- 홈 HTML에 `<video>`가 0개다. `home-hero.mp4` 참조는 0건이다.
- iPhone 13 에뮬레이션, 터치 iPad 가로 1180px, 1000px 데스크톱에서 영상 요청이 0건이다. reduced 에뮬레이션에서 `<video>` DOM이 0개다.
- 데스크톱에서 정지 버튼에 Tab으로 포커스가 가고 Enter·Space로 토글된다. 버튼은 `<Button variant="line" size="icon-md">`(44×44)이고 영상 박스 밖에 있다. 포커스 표시는 전역 보증 ①의 outline 하나이고 버튼의 computed `box-shadow`는 none이다(캡처 첨부).
- 버튼 aria-label이 `video.paused`와 항상 일치한다. autoplay를 막은 상태에서는 '영상 재생'으로 표시된다. 화면 밖이거나 탭이 숨겨지면 `paused === true`다.
- 브랜드 필름은 자동재생이 0이고, controls·포스터와 영상 아래 장면 요약이 있다.

**정직 라벨**
- Figure·Frame(capture·mock)에 `id`를 빼면 타입 오류가 나고, mock 행 id를 받은 Frame에 `annotations`나 `caption`을 넘기거나 children을 빼도 타입 오류가 난다(`@ts-expect-error` 테스트가 typecheck에서 통과).
- 장부 가드: 공개 라우트 빌드 HTML의 이미지 중 장부 미등록·미검증인 새 도판이 0이다. 미검증 id를 새로 쓰면 build가 실패한다. 기존 미검증 도판 수는 라우트 PR마다 줄어든다(래칫). P4가 끝나면 제품 라우트(SW·HW·ai-report)의 미검증 도판은 0이다. /checkout 동결 4파일의 존재·해시 테스트가 통과한다.
- vitest: `sourceLabel` 6종 출력이 X11 표와 같다. render의 `screen`이 있으면 캡션 왼쪽에 '화면: 실제 화면 · YYYY.MM 캡처'가 붙고 라벨은 '제품 렌더' 하나다. mock Frame 출력에 점선 태그 '예시 화면'과 sr-only '예시 화면: …'이 있고 `<figcaption>`은 없다. '○ 예시'는 0건이다.
- `example` LineChart의 캡션이 '· 예시'로 끝나고 제목에는 '예시'가 없다. `example:false`인데 `source`가 없으면 타입 오류가 난다.
- 목업 차트(SW, ai-report)의 캡션이 '· 예시'로 끝난다. ai-report에 10px `#A39E98` 라벨이 0건이고 점선 '예시 화면' 태그로 바뀌었다.
- KpiSpark를 만들면 같은 줄 '예시'는 mock Frame 안에서만 렌더된다(Frame 밖 사용처 0).
- 공개 코드에 credit '○○' 리터럴이 0건이다. 출처 미확인 도판에 짐작으로 단 라벨이 0건이다(장부 `verifiedAt` 없는 행은 렌더되지 않는다).
- 사람: 공개 페이지의 원형 이니셜 아바타 0, 스톡 인물 0(About은 P5 뒤). 식별 얼굴은 페이지당 1개 이하이고 각각 장부에 `consentDocId`가 있다.
- **근거 확인(머지 차단)**: 에빙하우스 7개 수치와 Freeman 인용이 원문(Ebbinghaus 1885 영역본 쪽수, Freeman et al. 2014 PNAS)과 대조된 기록이 PR 설명에 있다. 기록이 없으면 망각 곡선(블로그 글)과 인용 코드는 머지하지 않는다. ScienceBased 초상 2장(에빙하우스·Freeman)의 공개 참조는 0이다.

**차트**
- 공개 코드의 `from "recharts"` import가 0건이다. 홈 라우트 클라이언트 번들 크기 전후 diff를 첨부한다.
- 차트 코드에 `linearGradient`·`rgba(15,12,41`·`backdropFilter`·면 채움 fill이 0건이다. 홈 HTML에 DashboardPreview가 없다(V10-A).
- 차트 막대의 computed `border-radius`가 0이다(끝점은 원형).
- 사이트 전체에서 `stroke-dashoffset`·`draw-path`가 0건이다.
- vitest: Y 매핑에서 최솟값이 96%, 최댓값이 4%에 놓인다. 두 라벨이 9% 안에 있으면 9% 이상 벌어진다. sr-only 표의 행 수가 x 길이와 같다.
- 차트 등장: 1440×900과 390×844에서 무장 상태가 전환되는 동안 figure의 transform이 none이고 opacity만 바뀐다(`--motion-slow` `--ease-fade`, 간격 `--motion-beat`). 레이어 순서는 비교 → 강조 → 라벨이다. JS를 끄거나 reduced 에뮬레이션에서는 선·라벨·끝점이 즉시 모두 보인다.

**대비·도해**
- 도해·차트 정보선은 `--line-control`(#8A857F)만 쓴다. 정보선이 skeleton `#EFEEE9` 위에 놓인 곳이 0건이다. 도판 안 읽는 글자는 `--fg-muted` 이상이다.
- `tests/design/surface-contrast.test.ts`가 V15-A 값으로 통과한다(조작 경계 ≥3.2, muted ≥5.5).
- 도해 노드·바깥 줄의 computed `border-radius`가 0이고, 노드에 아이콘 원이 0개다.
- 공개 도판·캡션·차트에서 `#A39E98` 글자·선이 0건이다.
- docs 도해: 360/375/767/768/1024/1280/1440px에서 4개 도해의 모든 `<text>`와 HTML 라벨을 `getBoundingClientRect`로 환산한 글자 크기가 13px 이상이다. computed font-family 첫 항목은 Pretendard다. 화살촉(`.ah`)은 0개이고 `public/images/docs/diagrams/*.svg` 참조는 0건이다.
- 홈 HTML에서 도판·도해의 숫자 번호('그림 n', 열 폴리오)가 0개다.

**사진**
- sips: 사례 사진이 전부 3:2(비 1.5±0.01)이고 긴 변 1600px 이하, 320KB 이하다. 원본 대비 크롭 손실 16% 이하, 업스케일 0이다.
- sharp metadata: EXIF·GPS가 0이다. 그레이딩 뒤 가장 밝은 중립 면 평균이 R−B 4–8, luma 250 이하, 채도 .05 이하, 블랙 7 이상이고, 같은 페이지 사진 세트의 R−B 폭이 4 이하다. `grade-photos.mjs`의 assert(흰점 = paper)가 통과한다. 운영자가 시안에서 사례 3장이 한 빛으로 보이는지 승인한다.
- 휘도: 라우트별 공개 도판 평균 휘도가 100/255 이상이다. 예외는 HW 먹 장 OPS 컷아웃 1장뿐이다. 보드 화면 속 우주·자연 배경화면이 0이다.
- 제품 판: HW 페이지 제품 도판의 판 모서리 픽셀이 같은 값(밝은 판은 sunken 값, 먹 판은 surface-ink 값, ±1)이다. 그림자는 대상 아래 1개다. 장부의 kind `render` 행은 모두 `origin`이 확인돼 있다.
- 동의 게이트: CaseStudies에 렌더되는 모든 사진의 학원이 감사 D4 표에서 '공개 동의'로 표시돼 있다. 실명이 든 파일명이 0건이다. `photo` credit이 없는 사진은 렌더되지 않는다.
- 이미지 효과: 공개 섹션에서 이미지 대상 `mix-blend-`, `grayscale`, `drop-shadow-[`, `backdrop-blur`, `useScroll` 기반 이미지 scale이 0건이다. 이미지 대상 scale·clip-path·mask 애니메이션이 0건이다.
- 도판 현상: 4G 스로틀 필름스트립에서 액자·캡션·출처가 사진보다 먼저(또는 동시에) 보이고 사진이 opacity로 차오른다. 캐시 재방문에서 페이드 0, reduced에서는 즉시. 현상의 CLS 기여 0.
- 퇴출 자산 참조 0건(grep): `hero-dashboard.webp`(10a 뒤), `interactive-generated-v3`, `homework-generated-v3`, `use-cases/admin.png`, `use-cases/comms.png`, `admin-dashboard-source-2`(`public/l/*` 포함), `feature-writing.webp`, `two-way-blackboard.webp`, `noise-texture.svg`, `activity-icons/homework.png`·`class.png`, `touch-latency.webp`(감사 D5 뒤), `home-hero.mp4`, ScienceBased 초상 2장.
- **Hero 순서**: Hero 파란 지구 도판은 캡처를 기다리지 않고 10a에서 내린다(V11-A). 캡처 커밋(10b) 뒤 홈 첫 화면의 Hero capture Frame은 1개이고, 같은 파일은 페이지에 1회다.
- alt: 공개 코드에서 alt가 '사진'·'이미지'로 끝나거나 `Classin Education Dashboard`, `도입 사례 사진`과 일치하는 것이 0건이다.

**예산·레이아웃**
- `--budget` 모드(/, /product/sw, /product/hw, /pricing): 섹션당 `[data-frame]` 1개 이하, `.pattern-grid` 페이지당 1개 이하, 차트 등장 페이지당 1개 이하(홈 0), `[data-plate="L"]` 홈 0 · SW ≤1 · HW ≤2, 같은 이미지 파일 페이지당 1회.
- CLS: 홈·hw·sw·ai-report·docs 글 1편의 모바일 Lighthouse 3회 중앙값이 0.05 이하이고, 이미지 원인 layout shift는 0이다. /product/hw·/product/sw의 모바일 LCP 중앙값 악화가 0.3초 미만이다.
- 무게(390px, 끝까지 스크롤, 전달 기준): 홈 이미지 합 900KB 이하, 제품 1.2MB 이하, LCP 이미지 120KB 이하, plate AVIF 1200w 200KB 이하.
- plate: 콘텐츠 이미지에 `sizes="100vw"`가 0이다. plate 위 글자는 0개이고 kind `generated` plate는 0이다. 데스크톱·모바일 아트 디렉션 2컷의 슬롯 대 소스 가로세로비 편차가 5% 이하다.
- 매트: 40rem 이상 capture·mock Frame의 매트 패딩이 20px(64rem 이상 32px)이고, 40rem 미만에서는 0이다. 매트·Frame의 computed `border-radius`와 `box-shadow`는 0·none이다.
- 판독: 1440에서 도판 속 UI 본문 글자 렌더가 10px 이상이다. 신호등 점·딤 오버레이·블러가 0이다.
- 여백 칸 캡션: /product/sw 1440에서 비전폭 도판의 캡션이 10–12칸 아래 맞춤이고, 390에서는 도판 아래다. 모든 Figure에 X11 라벨이 정확히 1개다.
- 주석: 섹션당 0–1개, capture Frame에만 있다. 1023px 이하에서는 리더선이 0개이고 `<ol type="a">`가 렌더되며 마커는 aria-hidden이다.
- SSR·no-JS·reduced: JS를 끄고 reduced를 에뮬레이션한 상태에서 수업 OS 지도(● 6개, 산출물 라벨·'연동 범위' 줄 포함), 차트, 망각 곡선(블로그 글)이 최종 상태로 보인다. 375×812와 1440×900 캡처를 첨부한다.
- 가드: §7-18 규칙을 일부러 위반하면 경고(warn 기간) 또는 실패(error 전환 뒤)가 나고, 위반을 빼면 통과한다. img-ledger는 새 도판에 대해 처음부터 실패다.
- /admin·/checkout 스크린샷 diff 0, /checkout 이미지 4파일 존재.

---

## 9. DESIGN.md 반영안

system §10에 따라 DESIGN.md는 적용 범위를 'public(.site) / admin'으로 나누고 토큰마다 상태 배지(in force / target / retired)를 단다. 아래 절은 public 구획에 들어가고, 절 번호는 다른 신설 절과 함께 최종 정렬한다. 토큰 행은 P0 PR에서(V15-A 지면 값·V17-A 모션 토큰은 P2 토큰 PR에서), 컴포넌트 행은 해당 구현 PR과 같은 커밋에서 반영한다. V10–V18 결정 기록 자체는 DESIGN.md §9가 맡는다(이 문서는 그 기록을 바꾸지 않는다).

```diff
+## 도판·도해·데이터 시각화 (public · .site) — 2026-10-26, 고급화 V10–V18 A 반영 2026-10-28
+
+사진·화면·도해·차트는 교육 전문지의 '도판'이다. 장식이 아니라 증거로 쓴다. 모든 도판의 정직 라벨은 출처 장부에서 나오고 효과는 쓰지 않는다.
+출처를 밝힐 수 없는 도판은 싣지 않는다. 대체 전에 빈 Frame을 두지 않고 텍스트·사양표·도해로 무게를 유지한다. 상세 정본은 imagery 스펙이다.
+
+### 출처 장부와 정직 라벨 [target] — data/image-credits.json, Figure/Frame은 id만 받는다
+- 장부 행: file·family·kind·credit·origin·consentDocId·verifiedAt·frozenBy(+ neutralPatch). 코드 목업도 kind 'mock' 행(file 없음, summary)이고 Frame은 그 id + 자식 목업을 받는다. verifiedAt 없는 새 도판은 빌드 실패, 기존 미검증 도판은 라우트 PR마다 래칫.
+- 라벨 6종: 실제 사진 `사진 · {제공처}`(credit 필수, '○○' 금지) · 실제 연출 촬영 `예시 연출` · 생성 `AI 생성 이미지`(분위기 컷만, 제품·UI·식별 얼굴·plate 금지)
+  · 실제 제품 렌더 `제품 렌더`(화면 합성이면 캡션에 '화면: 실제 화면 · YYYY.MM 캡처') · 실데이터 화면 `실제 화면 · YYYY.MM 캡처` · 목업은 Frame 안 오른쪽 위 점선 태그 `예시 화면`.
+- 출처 미확인 도판에는 라벨을 짐작해 달지 않는다. '출처 확인 중' 같은 새 종류는 만들지 않는다.
+- /checkout 이미지 4파일은 frozenBy 'checkout'(삭제·덮어쓰기 금지), 공개 페이지에서는 장부 검증 전 사용 0.
+- Frame 밖 예시 수치 묶음에는 `수치는 예시입니다`. ○●–는 상태 전용이고 '예시'를 뜻하지 않는다.
+- 예시 데이터 차트 제목은 서술형이고, 캡션 끝에 `· 예시`(`example: true`가 강제). 결론형 제목은 출처 있는 실데이터에만.
+
+### 캡션과 번호 [target]
+- 캡션: 도판 아래 12px → 1px hair → 8px, 13px #615D59 tabular. 왼쪽 장면, 오른쪽 라벨. 목업은 캡션 없이 Frame 안 점선 태그만.
+- 64rem 이상에서 12칸 전폭이 아닌 도판은 캡션을 여백 칸(10–12)에 아래 맞춤으로(설명 60자 이하, 출처 라벨 13/500 #111110). 제품 장·/about만, 홈 제외.
+- 한 페이지의 숫자 번호 체계는 2종 이하. '그림 n'은 도판 3개 이상인 장문에만. 홈·탭·캐러셀 도판은 번호 없음. 주석 마커는 a·b.
+
+### 도판 3계열·한 빛 [target]
+- 현장(3600–3800K 단일 색온도, 3:2) · 사물(16:10 무봉 판 1색 = sunken 값, 좌상 키 라이트 하나, 구운 접지 그림자 1개) · 화면(라이트 테마, 한국어 시드, 16:10).
+- 공개 도판 평균 휘도 100/255 이상(HW 먹 장 OPS 컷아웃 1장만 예외). 보드 화면 속 우주·자연 배경, 시네마틱 다크 키, 네온·유리 컷 금지.
+- 식별 가능한 얼굴은 페이지당 1개 이하 + consentDocId. 이니셜 원 아바타·스톡 인물 금지.
+
+### 사진 [target]
+- 톤은 에셋 단계에서 굽는다: 사진별 중립 패치 WB → 공통 그레이드(흰점 = --surface-paper #F9F8F5 · 블랙 +3% · 채도 −10%), 세트 R−B 폭 4 이하. 스크립트는 저장소 의존성 밖에서 실행한다. 런타임 filter 금지. 캡처는 원본 색.
+- 비율: 사례 3:2(aspect-case), 화면·제품 16:10(aspect-screen, 재캡처), 인물 4:5(aspect-portrait), 영상 16:9. 4:3 폐기.
+- 크기 3단: L plate(max-w-page 1200 안 12칸 전폭, 16:9 / 모바일 4:5, 위에 글자 0, 홈 0 · SW ≤1 · HW ≤2 · 블로그 글 표지 1) · M(2열 584 · Hero 480) · S(여백 120~282). 풀블리드·콘텐츠 이미지 sizes="100vw" 0.
+- 사전 크롭 손실 16% 이하, 업스케일 0. 못 맞추면 사진 없이 간다. 같은 이미지 파일은 페이지당 1회.
+- 도판 r0, 1px hair(fig-edge), CSS 그림자·hover 확대·패럴랙스 0. 제품 렌더 자산 안의 구운 접지 그림자 1개(α ≤ .18, 띄움 0)만 이미지 내용으로 허용.
+- 영상·사진 위에는 큰 글자(24px+ 또는 18.66px+ 볼드)와 CTA만. 스크림은 --surface-scrim(.48) 한 겹(모든 프레임에서 3:1 보장).
+- 마스킹은 --surface-skeleton 단색 블록, 블러 금지. 익명 사례는 파일명에도 실명 없음. 교체 파일은 새 이름(*.g1.webp).
+- decode 전 도판만 opacity로 현상한다(액자·캡션·출처는 즉시, 캐시 페이드 0, scale·clip-path·mask·와이프 0).
+- 금지 소재: 서양 스톡, 클레이·3D, 무지개 칩, 외국어 포스터, 가상 화면 렌더, 출처 미확인 렌더.
+
+### Frame [target]
+- sheet + 1px hair + r0, 그림자 0, 제목줄·창틀 없음(components/ui/figure.tsx).
+- 매트: 40rem 이상 sunken 여백판 20px(64rem 이상 32px), 40rem 미만은 매트 없이 전폭.
+- paper·sunken 섹션에만, 섹션당 1개. 먹 지면에는 두지 않는다. 실제 캡처가 있으면 목업보다 우선.
+- 화면 도판 2종: 전체 1920×1200(페이지당 1) · 영역 720×450 CSS px @2x. 도판 속 UI 본문 글자는 64rem 이상에서 렌더 10px 이상.
+- 주석은 실제 화면 캡처에만(타입으로 강제): ≥64rem 리더선 1px #8A857F + 6px #084734 점 + 13px 메모, 그 아래 폭은 a·b 목록. 섹션당 1개.
+
+### 펜 도해 [target]
+- 정보선 --stroke-pen(1.5px, DPR1 2px) #8A857F, 직교 배선, 꺾임 r3, 화살촉 대신 6px 단자 점. skeleton #EFEEE9 위 금지.
+- 강조 경로는 도해당 1개, --stroke-accent 2px #084734. 노드는 채움 없는 r0 상자이고 윤곽은 정보선과 같은 --stroke-pen #8A857F. 아이콘 원 금지. --line-strong(.16)은 도해에 쓰지 않는다(장식선 전용).
+- 글자는 HTML이나 인라인 SVG로 Pretendard 상속, 렌더 13px 이상. 대표 도해는 '수업 OS 지도'(LessonOsMap, OS_MODULES SSOT).
+- 금지: 3D·글래스·글로우·그라데이션·캐릭터·이모지·손그림, #A39E98 선.
+
+### 데이터 시각화 [target]
+- 서버 SVG(components/charts/: LineChart·BarList, KpiSpark는 사용처가 생길 때), 공개 Recharts 0, JS 0. `example: boolean` 필수.
+- 강조 1계열 2px #084734, 비교 1.5px #8A857F(라벨 글자 #615D59), 목표선 점선, 면 채움 0, 막대 r0.
+- 끝값 포함 직접 라벨(13/500), 눈금 13px #615D59 tabular, 가로 기준선 최대 5줄, 막대는 0 기준.
+- 등장은 페이지당 1개(홈 0), [data-seq] opacity 순차(--motion-slow 900ms --ease-fade, 레이어 간격 --motion-beat 240ms). stroke-dashoffset 0. reduced·JS 없음은 완성 상태.
+- 금지: 그라데이션, 도넛 남발, 3D, 가공 비교선, 카운트업, 툴팁.
+
+### 영상 [target]
+- 홈 영상 0(V3-A). 배경 루프는 제품 페이지에서만: ≥64rem·hover 기기·동작 줄이기 꺼짐에서만 로드, 화면 밖·탭 숨김 정지, 44px 정지 버튼(실제 재생 상태 파생).
+- 루프: 720p H.264 crf 23, 2.5Mbps, 5MB 이하, 오디오 0, bt709 태그, 출력 흰점 = paper. 포스터는 지정 프레임(posterAt)을 사진과 같은 그레이드로, next/image만. <video poster> 금지.
+- 내용 영상: 자동재생 없음 + controls. 음성 있으면 자막, 무음이면 장면 요약. GIF 금지. 영상은 LCP 경로에 넣지 않는다.
+
+### 성능 [target]
+- unoptimized 0, priority 0(Next 16은 preload), fill이면 sizes 필수. preload는 Header 0·라우트당 LCP 1. 홈은 LCP = H1, 이미지 preload 0.
+- 마스터: 카드 1600px·320KB(q88), Hero 도판 1920px·400KB, SVG 15KB. 전달: LCP 이미지 120KB, plate AVIF 1200w 200KB, 홈 이미지 합 900KB.
```

**DESIGN.md §7 AI 에이전트 프롬프트 가이드에 추가**
```diff
+- 모든 도판은 data/image-credits.json 장부 id로만 넣고, 정직 라벨(사진 · 제공처 / 예시 연출 / AI 생성 이미지 / 제품 렌더 / 실제 화면 · 캡처 / 점선 '예시 화면')은 장부에서 나온다. 출처를 모르는 도판에 라벨을 짐작해 달지 않는다. 예시 데이터에 결론형 제목을 쓰지 않는다. 출처 없는 수치·이미지는 넣지 않는다.
+- 이미지에 CSS filter·mix-blend·backdrop-filter·drop-shadow·hover scale·패럴랙스·반경을 쓰지 않는다. 풀블리드와 sizes="100vw"를 쓰지 않는다. 스크림은 영상·사진 위 큰 글자가 있을 때만 bg-surface-scrim 한 겹.
+- 도해 선은 --stroke-pen #8A857F, 강조는 --stroke-accent #084734 한 경로. 화살촉 대신 단자 점, 글자는 Pretendard 13px 이상.
+- 차트는 components/charts/의 서버 컴포넌트만 쓴다(Recharts 금지). 강조 1계열, 끝값 직접 라벨, 면 채움 0, 막대 0 기준, 등장은 opacity만.
```

**감사·모션 플랜 문서 동기화**(`docs/active/public-site-audit-motion-plan-2026-10-26.md`)
```diff
 §5-4 DashboardPreview 행
-  데이터가 그려진다: 선 1200ms, 막대 900ms … Recharts animationDuration …
+  DashboardPreview는 홈 11지면 목차에서 빠진다(V10-A). 차트 문법은 SW·ai-report에 쓴다: 서버 SVG(Recharts 0), 등장 = <Reveal bare threshold={0.4}> 안 [data-seq] opacity 순차(비교 0 → 강조 1박자 → 라벨 2박자, 박자 --motion-beat 240ms, 각 --motion-slow 900ms --ease-fade). "예시 화면" = Frame 안 점선 태그. 툴팁 없음(직접 라벨).
 §5-5-1 HW
-  HW 서사 모먼트는 LatencyProof 의 펜 획 SVG 그리기 하나(수치 확정 D5 뒤)
+  HW 서사 모먼트는 LatencyProof 차트의 opacity 순차 등장 하나(감사 D5 뒤). stroke-dashoffset은 사이트 전체 0.
 §5-6
-- **다이어그램:** 1.5px 선, `#A39E98` 선에 강조 노드만 `#084734`, 채움 없음.
+- **다이어그램:** --stroke-pen(1.5px, DPR1 2px, V6) `#8A857F` 선(#A39E98은 3:1 미달), 강조 경로 1개만 2px `#084734`, 화살촉 대신 단자 점, 채움 없음, 노드 r0, 글자 Pretendard 13px 이상.
-- **마케팅 차트:** … 나머지 `#A39E98` …
+- **마케팅 차트:** 강조 1계열 `#084734`, 비교 `#8A857F`(라벨 `#615D59`), 끝값 직접 라벨, 13px tabular, 면 채움 0, 막대 r0, 목업은 점선 '예시 화면' 태그 + 서술형 제목(캡션 끝 '· 예시'), 서버 렌더, 등장은 페이지당 1회 opacity.
-- **사진:** HW 기획서 톤(3200~4000K, 채도 −10%)을 사이트 전체에, radius 16px, 오버레이는 하단 `black/40` 이하 하나.
+- **사진:** 사진별 중립 패치 WB 뒤 공통 그레이드(흰점 = paper #F9F8F5·블랙 +3%·채도 −10%)를 에셋 단계에서 굽는다(런타임 filter 금지). 도판 radius 0(V14-A), 스크림은 큰 글자가 있을 때만 --surface-scrim(.48) 한 겹. 공개 도판 평균 휘도 100/255 이상(HW 먹 장 1장 예외).
 §5-8
-  패럴랙스 남발(스크롤 연동은 Manifesto·BigBackdrop 2곳 상한)
+  패럴랙스 남발(이미지 스크롤 연동 0. BigBackdrop은 풀블리드를 폐기하고 콘텐츠 폭 plate로 정지한다)
-  (opacity·transform, 작은 SVG `stroke-dashoffset` 만)
+  (opacity·transform만. stroke-dashoffset은 사이트 전체 0)
-  예외는 정지 가능한 마키와 히어로 영상 둘.
+  홈 무한 루프 0. 제품 페이지 배경 영상만 정지 버튼·화면 밖 정지 조건으로 허용.
 방향 문서 먹 지면 보조 글자 대비
-  /.56 (6.14)
+  /.56 (6.00, 먹 #1A1917 위, V15-A)
```

**`docs/hw-intro-visual-plan.md` 머리에 추가**
```diff
+> **2026-10-26 대체됨.** 배경색(#ECFDF5·#0D1A12), 글로우, 3D 분해 렌더, '콘트라스트 +5%', 오버레이 `from-black/85`는 DESIGN.md '도판·도해·데이터 시각화'로 대체됐다. 이 문서는 섹션별 촬영 피사체 목록만 참고한다(실제 촬영은 imagery 스펙 §3-6b 기준, 제품 도판은 §3-5 제품 판 합성 기준).
```

---

## 10. 하지 말 것

- 이미지에 filter, blend, backdrop, drop-shadow, hover scale, 회전, 패럴랙스, CSS 그림자를 쓰지 않는다. 대표 Frame용 elevated도 없다. 이미지 안 그림자는 '제품 렌더' 자산에 구운 접지 그림자 1개(α ≤ .18, 띄움 0, 좌상 키 라이트 하나)만 허용한다(X05).
- 색 후광·림 라이트·네온·반사 바닥이 구워진 제품 이미지를 쓰지 않는다. 보드 화면 속 우주·자연 배경화면, 시네마틱 다크 키, 네온·유리 제품 컷을 쓰지 않는다. HW만 다크 키를 허용하거나 HW에 둘째 먹 장을 두지 않는다.
- 도판에 와이프·커튼·clip-path·mask 리빌, 로드 시 scale 안착, 켄 번스를 쓰지 않는다. 현상은 decode 전 도판의 opacity 하나다.
- 도판·Frame·매트·도해 노드·차트 막대에 반경을 쓰지 않는다(V14-A). 풀블리드 이미지와 콘텐츠 이미지의 `sizes="100vw"`를 쓰지 않는다. plate 위에 글자를 두지 않는다.
- 영상·사진 위에 본문 문단을 두지 않는다. 스크림을 여러 겹 쌓지 않는다. 그라데이션 스크림을 쓰지 않는다.
- 서양 스톡 인물, 악수, 퍼즐, 지구본, 클레이 3D, 무지개 칩, 외국어 포스터를 쓰지 않는다. 제품이나 UI가 들어간 AI 생성 이미지를 쓰지 않는다. AI로 만든 '한국 학원 + Classin 보드' 장면, 더 나은 스톡, AI 업스케일로 대신하지 않는다. 한 도판에 라벨 두 개('AI 생성 이미지' + '예시 연출')를 달지 않는다.
- 출처가 확인되지 않은 도판에 라벨을 짐작해 달지 않는다. '출처 확인 중' 같은 새 라벨 종류를 만들어 도판을 남기지 않는다. 기존 HW 렌더를 출처 확인 없이 컷아웃해 재사용하지 않는다(렌더되는 21개 중 5개가 생성 스크립트 출력명과 같고 16개는 출처 기록이 없다).
- 같은 이미지 파일을 한 페이지에 두 번 쓰지 않는다(배경·포스터 포함). 식별 가능한 얼굴을 페이지에 2개 이상 두지 않는다. 이니셜 원 아바타를 쓰지 않는다.
- /checkout이 쓰는 이미지 4파일을 지우거나 같은 이름으로 덮어쓰지 않는다.
- 출처 없는 수치, 예시 데이터의 결론형 제목, 가공 비교선, 면 채움, 그라데이션 차트, 툴팁, 카운트업을 쓰지 않는다. 공개 화면에서 Recharts를 import하지 않는다.
- ○를 '예시' 뜻으로 쓰지 않는다. Frame에 제목줄이나 가짜 창틀을 두지 않는다. mock에 주석을 달지 않는다. 먹 지면에 Frame·사진·차트·도해를 두지 않는다.
- 도해에 화살촉, 3px 진한 선, 13px 미만 글자, skeleton 위 정보선, `#A39E98` 선을 쓰지 않는다.
- 홈 도판·도해에 숫자 번호('그림 n', 열 폴리오)를 달지 않는다. 주석에 ①②를 쓰지 않는다.
- stroke-dashoffset, `.draw-path`, 무한 루프(점멸·웨이브폼·펄스)를 쓰지 않는다. 홈에 영상을 두지 않는다.
- 블러 마스킹을 하지 않는다. 실명 파일명에 익명 본문을 붙이지 않는다. 같은 이름으로 이미지를 덮어쓰지 않는다(immutable 캐시).
- GIF, 오디오 트랙이 남은 무음 루프, `<video poster>`를 두지 않는다.
- 숨김 요소에 preload를 걸지 않는다. `priority`를 쓰지 않는다. Header 로고에 preload를 걸지 않는다.
- 새 색·굵기·크기 토큰(`--dg-*`, `--chart-*`, `--fig-scrim*`)이나 `.surface-ink` 재정의를 이 스펙에서 만들지 않는다. `var()`에 fallback을 쓰지 않는다. 36px 버튼, z 리터럴, 0·6·원형 밖의 반경을 쓰지 않는다.
- 출처 미확인 첫 화면 도판을 대체가 없다는 이유로 남기지 않는다(V11-A). 대체 전에 빈 Frame을 두지 않는다.
- 그레이딩·합성 스크립트를 저장소 의존성(package.json·빌드)에 넣지 않는다.

---

## 11. 열린 질문

1. **감사 D4 사례 동의**: 사례 7개 학원의 사진 공개·초상 동의가 확인되지 않았다. 학생 얼굴이 식별되는 컷을 확인 전에 바로 내릴지 정해 달라(1단계, 권장). 크롭 기준만으로도 busan·pyeongtaek·cheongju는 사진 없이 간다. 3-6b 촬영 대상 학원과 일정이 필요하다.
2. **§3-6a 재캡처 담당**: EDB 판서(강사·CSM 1명 + 테스트 계정), KeyUseCases 4장, 홈 '04 화면' 영역 캡처, AI 리포트 화면을 개인정보 없는 테스트 계정·한국어 시드 데이터로 다시 캡처할 담당자가 필요하다. Hero는 V11-A로 캡처 전에도 무도판 표지로 진행하고, 캡처가 커밋되면 V3-A 7/5로 바꾼다.
3. **V3 Hero와 V11**: 닫힘(2026-10-28). V3-A를 적용했고, V11-A 승인으로 V3 보충 문장('실제 화면 캡처를 확보하기 전에는 현재 도판을 유지한다')이 '캡처 전에는 무도판 표지, 현 도판은 내린다'로 바뀌었다(V11-A 승인이 이 교체의 승인이다). (참고: B(sticky 다크 영상 유지)였다면 `home-hero.mp4` 재인코딩, 스크림 `bg-surface-scrim` 1겹(X01 .48. 결정 V3-B 문구의 '.40'은 X01 한 토큰으로 읽는다, §3-12), 정지 버튼, 숨김 요소 preload 금지가 필요했다.)
4. **수업 OS 지도 SSOT**: `OS_MODULES.name`과 순서는 C08 장부 6행(칠판·교안·녹화·LMS·학생 관리·관리자 데이터)으로 맞췄다. 남은 확인은 세 가지다: '학생 관리'의 phase 기본안 '수업 후', 산출물 라벨, '연동 범위 · 결제 · 오프라인 출석 · 고급 리포트' 문구. 제품 설명 정본(`lib/classin-positioning.ts`의 `oneLine`, 정식 명칭 전자칠판·EDB 교안·수업 녹화)과 약칭의 대응은 그 담당자가 확인한다. 약칭을 바꾸면 C08과 cards_motion `module` 값을 같은 커밋에서 바꾼다.
5. **HW BigBackdrop**: 닫힘(2026-10-28). 풀블리드를 폐기하고 콘텐츠 폭 plate로 바꾸며, plate 위 글자는 0이고 카피는 plate 아래 paper로 옮긴다(RA-5).
6. **생성 라벨의 법무와 출처 장부 1차 검증**: 인공지능기본법(2026-01 시행)의 생성형 결과물 고지 의무가 마케팅 사이트 이미지에 적용되는지 법무 확인이 필요하다[지식]. 별도로, 장부 1차 검증 담당자(P2-0 지정)가 `hero-dashboard`·`writing-*`·`space-*`·`camera-*`·`culture/*`·ScienceBased 초상의 출처를 구매·제작 기록, EEO·쿼드러닝 제공 여부로 확인해야 한다. HW 렌더는 21개 중 5개가 생성 스크립트 출력명과 같고(3개는 git상 Gemini 생성), 16개는 기록이 없다. 확인 전에는 어떤 라벨도 짐작해 달지 않는다. 생성으로 확인되고 제품이 보이면 교체·삭제 대상이다.
7. **원문 대조 담당**: 에빙하우스 수치(58.2/44.2/35.8/33.7/27.8/25.4/21.1)와 Freeman 인용(1.5배·55%)은 원문 대조 전까지 머지를 막는다. 대조할 담당자가 필요하다.
8. **그레이딩 상수**: 흰점은 `--surface-paper` 값으로 고정됐다(V15-A). lift 8, 채도 .9는 시안에서 대표 3장(대구·천안·대치)의 원본과 적용본을 나란히 보고 확정한다. 사진별 `neutralPatch` 좌표를 장부에 채울 담당이 필요하다.
9. **블로그 썸네일**: 상승 화살표·막대처럼 '성과 그래프'로 읽히는 장(예: thumb-02, thumb-05)을 순환에서 뺄지 정해 달라. 블로그 세션 커밋 뒤에 진행한다.
10. **브랜드 필름**: 기본안은 자동재생을 끄고 controls를 두는 것이다. 무음 자동재생 + 정지 버튼을 원하면 알려 달라(그 경우 C07의 제품 페이지 루프 조건 넷을 About에도 적용한다).
11. **정본 문구 정리 요청(system에)**: 결정 V3 옵션 B의 '평면 스크림 .40'을 X01 `--surface-scrim`(.48)로 고쳐 달라(§3-12). (닫힘 2026-10-28: `[data-seq]` 지연은 `--motion-beat` 토큰이라 리터럴 허용 목록 요청이 없어졌고, 도해 노드 윤곽은 r0 · `--stroke-pen` `--line-control`로 정해졌다. 정지 버튼 포커스는 보증 ① 하나라 box-shadow 예외 요청도 없다.)
12. **/checkout 생성 추정 이미지 2장**: `space-s75-seminar`·`space-s86-classroom`은 생성 스크립트(`scripts/generate-hw-images.ts:233,246`) 출력명과 같다. 결제 화면은 디자인 범위 밖이므로 라벨·교체 여부는 운영자가 정한다. 그 전까지 파일은 동결하고 공개 페이지에서는 쓰지 않는다.
13. **mock Frame과 장부 id**: 닫힘(2026-10-28). 코드 목업도 장부에 kind `mock` 행(id, file 없음, summary)으로 등록하고, Frame은 그 `id`와 자식 목업 컴포넌트를 받는다(§3-1·§3-7). 점선 '예시 화면' 태그는 그대로다.
14. **900ms 모먼트 토큰 이름**: 닫힘(2026-10-28). `--motion-slow`가 900ms이고(V17-A), 순차 간격은 `--motion-beat` 240ms다. 이 문서의 `[data-seq]`·도판 현상은 두 토큰을 쓴다.
15. **About 스톡 6장**: 커밋 `cd9803d2`가 classin.com 공식 사진(사용 허락)으로 기록한다. 장부 `origin`에 이 근거를 적되, 스톡 인물 퇴역(P5) 뒤 지사 사진 1장(직원 동의)을 쓸지 텍스트로 둘지 정해 달라.
