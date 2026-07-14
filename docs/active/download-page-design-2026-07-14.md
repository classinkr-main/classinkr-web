# 다운로드 페이지 신설 + GNB 재배치 설계 (2026-07-14)

## 배경 / 목표

공개 사이트에 **Classin 앱 다운로드 페이지(`/download`)** 를 신설한다. 레퍼런스는
공식 다운로드 페이지(classin.com/download)이며, 우리 브랜드/디자인([DESIGN.md](../../DESIGN.md) 팔레트)으로
새로 구성한다. 사용자가 우리 도메인에 머문 채 기기별 Classin 앱을 내려받게 한다.

동시에 GNB(전역 내비, [components/sections/Header.tsx](../../components/sections/Header.tsx))의 우측 클러스터에서
`자료 받아보기`(→`/resources`) 항목을 제거하고, 같은 자리(`내 계정` 옆)에 **다운로드**(→`/download`)를 넣는다.
`자료 받아보기` 진입점은 GNB에서 숨기되 **블로그·행사 상세 페이지 하단 추천 밴드**로 재배치한다.
`/resources` 페이지 자체는 그대로 유지한다.

## 파트 / 담당

`홈 및 랜딩 (Front)` — 담당 에이전트 `home-front`. GNB·공개 페이지·디자인 시스템 범위.

## 범위 결정 (확정)

- **다운로드 방식**: 우리 사이트에 `/download` 페이지 신설 (외부 링크 아님).
- **플랫폼 범위**: Classin 본체(Windows / macOS / iOS / Android / Linux) + ClassIn X(교실용).
  **CamIn 제외** — 학원 타겟과 거리가 있어 뺀다.
- **자료 받아보기**: GNB에서 숨기고, **블로그·행사 상세 페이지 하단**에 추천 밴드로 재배치. `/resources` 유지.

## 다운로드 데이터 (버전 6.0.8, HubSpot 추적 파라미터 제거)

| 플랫폼 | 구분 | URL |
|---|---|---|
| Windows | Windows 7 이상 | `https://download.eeo.cn/client/classin_win_install_6.0.8.2730_s.exe` |
| macOS | Intel (x86_64) | `https://download.eeo.cn/client/classin_mac_install_6.0.8.2734_s.dmg` |
| macOS | Apple Silicon (arm64) | `https://download.eeo.cn/client/classin_mac_install_6.0.8.2735_arm64.dmg` |
| iOS | App Store | `https://apps.apple.com/app/classin/id1226361488` |
| Android | Google Play | `https://play.google.com/store/apps/details?id=cn.eeo.classin` |
| Linux | x86_64 (.deb) | `https://www.eeo.cn/download/client/classin_6.0.8.2737_amd64.deb` |
| Linux | arm64 (.deb) | `https://www.eeo.cn/download/client/classin_6.0.8.2738_arm64.deb` |
| ClassIn X | Windows 64bit | `https://download.eeo.cn/client/classinx_win_install_6.0.8.2733_x64.exe` |
| ClassIn X | Windows 32bit | `https://download.eeo.cn/client/classinx_win_install_6.0.8.2732_s.exe` |

> URL에 버전이 박혀 있어(`...6.0.8.2730...`) 버전 갱신 시 데이터 파일 한 곳만 고치면 되도록 중앙화한다.

## 아키텍처 / 컴포넌트

### 1. 다운로드 데이터 모듈 — `lib/downloads.ts`

- 목적: 다운로드 버전·URL·라벨을 한 곳에 상수로 모은다. 유지보수 시 이 파일만 수정.
- export: `CLASSIN_VERSION`(예: `"6.0.8"`), 타입 `DownloadPlatform`, 배열 `PRIMARY_DOWNLOADS`(Windows/macOS/iOS/Android),
  `SECONDARY_DOWNLOADS`(Linux/ClassIn X). 각 항목: `{ id, os, label, note?, variants: { label, href }[] , icon }`.
- 의존: 없음(순수 상수). 테스트: URL 형식/필수 필드 스냅샷 수준(선택).

### 2. 라우트 — `app/download/page.tsx` (서버 컴포넌트)

- `/resources/page.tsx` 패턴을 따른다: `createPublicMetadata` + `JsonLd`(WebPage + Breadcrumb).
- `revalidate` 불필요(정적 콘텐츠). metadata title "다운로드", path `/download`.
- 본문은 `DownloadPageClient`(아래)를 렌더. 데이터는 `lib/downloads.ts`에서 주입.

### 3. UI — `app/download/DownloadPageClient.tsx` (클라이언트 컴포넌트)

- 이유: 접속 기기 OS 자동 감지(하이라이트) 때문에 client 필요.
- 레이아웃(위 시안 기준):
  1. **히어로**: `Download` eyebrow + "Classin 앱 다운로드" + 현재 버전 표기.
  2. **자동 감지 하이라이트 카드**: `navigator.userAgent`로 Windows/macOS/iOS/Android 추정 →
     해당 플랫폼 다운로드를 맨 위에 크게. 감지 실패 시 Windows를 기본 노출.
  3. **주요 플랫폼 그리드**(2열, 모바일 1열): Windows / macOS(Intel·Apple Silicon) / 모바일(App Store·Google Play).
  4. **기타 플랫폼**: Linux(x86_64·arm), ClassIn X(64/32bit) — 얇은 보더 칩/카드로 하위 노출.
- 디자인 규칙: [DESIGN.md](../../DESIGN.md) 팔레트만. 넓은 면=뉴트럴(`#FFFFFF`/`#F6F5F4`), 그린(`#084734`/`#ECFDF5`)은 액센트로만.
  보더 `1px solid rgba(0,0,0,0.08)`, 모바일 우선 반응형. 아이콘은 lucide-react(`Monitor`, `Smartphone`, `Download` 등) 사용.
- 각 다운로드 버튼/링크는 `TrackedLink`로 감싸 `ctaId`(예: `download_windows`, `download_mac_arm`, `download_ios`)와
  `download_materials` 계열 계측을 붙인다(기존 트래킹 컨벤션 확인 후 정렬). 외부 링크는 `target="_blank" rel="noopener"`.

### 4. GNB 변경 — `components/sections/Header.tsx`

- **데스크톱 우측 클러스터**: `자료 받아보기` TrackedLink(→`/resources`) 제거 →
  같은 자리(`SessionNavEntry` 옆, `도입 문의` 앞)에 **다운로드** TrackedLink(→`/download`, `ctaId="gnb_download"`) 추가. 동일 텍스트 링크 스타일 유지.
- **모바일 메뉴**: 하단 액션 그룹의 `자료 받아보기` 제거 → **다운로드**(→`/download`, `ctaId="gnb_mobile_download"`) 추가.
- `/resources` 페이지·라우트는 유지(삭제 아님).

### 5. 자료 받아보기 추천 밴드 — `components/sections/ResourcesRecommendation.tsx`

- 재사용 컴포넌트 1개. 얇은 보더 카드: eyebrow("자료실") + 제목("도입 검토에 필요한 PDF 자료") +
  한 줄 설명 + `자료 받아보기` 링크(→`/resources`, `TrackedLink` `ctaId="resources_reco_{surface}"`).
- 배치: **블로그 상세**([app/blog/[slug]/page.tsx](../../app/blog/%5Bslug%5D/page.tsx)) 하단(기존 "다음으로 읽으면 좋은 글"/CTA 근처)과
  **행사 상세**([app/events/[slug]/page.tsx](../../app/events/%5Bslug%5D/page.tsx)) 하단에 삽입.
- 중복 노출 방지: 상세 페이지에 이미 검은 CTA 블록이 있으므로, 밴드는 그와 시각적으로 구분되되 과하지 않게(뉴트럴 카드) 배치.

## 데이터 흐름

`lib/downloads.ts`(상수) → `app/download/page.tsx`(서버, metadata) → `DownloadPageClient`(렌더 + OS 감지) → `TrackedLink`(계측).
GNB/추천 밴드는 정적 링크만 → `/download`, `/resources`.

## 엣지 케이스 / 에러 처리

- OS 감지 실패/SSR: 기본값(Windows) 노출, 모든 플랫폼은 그리드에서 항상 접근 가능(감지는 편의 기능일 뿐).
- 외부 CDN 다운로드 링크는 새 탭(`target="_blank" rel="noopener noreferrer"`).
- 버전 업데이트는 `lib/downloads.ts`만 수정(운영 메모로 파일 상단 주석).

## 검증 기준

```bash
npx eslint app components lib --max-warnings=0
npm run build
```

- 브라우저 프리뷰로 `/download` 렌더·OS 감지·링크 확인, GNB에서 다운로드 노출/자료받아보기 미노출 확인,
  블로그·행사 상세 하단 추천 밴드 확인.

## 범위 밖 (하지 않음)

- `/resources` 페이지 삭제/이동.
- 목록 페이지(`/blog`, `/events`) 하단 추천 밴드(상세 페이지만 하기로 확정).
- CamIn 다운로드.
- 다운로드 버전 자동 최신화(수동 상수 유지).
