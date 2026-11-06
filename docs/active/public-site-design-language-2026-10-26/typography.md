# 타이포그래피 (typography) — 편집 지면 · OS판 최종 스펙

> 정본 순서: canonical C01–C28 · X01–X16 > naming · css_architecture > 이 문서. 운영자 결정은 V1–V9(방향 문서)와 V10–V18(고급화 기획 `docs/active/public-site-premium-elevation-2026-10-28.md`), 감사·모션 플랜 문서의 결정은 '감사 D#'으로 적는다(C03). V1–V9는 2026-10-27에, V10–V18은 2026-10-28에 모두 A로 확정됐다. 고급화 기획의 채택 변경은 제안 ID(TY-1, RA-1 등)로 적는다.
> 상태: **V10–V18 A 반영 2026-10-28**(운영자가 V10–V18 전부 A 승인). 이 문서에 닿는 것은 V11(Hero 표지)·V12(Kicker)·V13(굵기)·V17(잉크 밑줄 템포)·V18(서체)과 결정 없이 채택된 TY-1·TY-6·TY-7·TY-9·RA-1·RA-6·CO-4다. 스펙은 목표를 적고, 구현 여부는 적지 않는다.
> 이 문서가 소유하는 것: 서체·로딩(C04·C20), 타입 스케일 15종과 자간·측정폭(C18), Display·Poster 사용처(C10), Kicker·ChapterHead 글자 규격(C22·X15), 잉크 밑줄의 모양(C25), 숫자 글리프(X14), OG 폰트(C28), PullQuote·Numeral 글자 규격, 장문 사다리와 교열 기준의 글자 쪽. 색 값은 surfaces(C01·X01), 링크 유틸과 입력 16px 보증은 controls(X12·C16), 모션은 cards_motion(C25·X07), 스코프·가드·레이아웃·tw-merge 설정 위치는 system 스펙이 소유한다. 여기서는 참조만 하고 값을 복제하지 않는다.

**확인 표기**
- **[실측]** 직접 측정했다: Pretendard 1.3.9 가변 TTF·OTF와 Apple SD Gothic Neo·SF의 메트릭 표, WCAG 2.x 공식 대비, 저장소 node_modules로 실행한 Tailwind 4.1.18 `compile()`과 tailwind-merge 3.4.0 출력, 공개 TSX 209개 grep.
- **[코드]** HEAD 코드를 직접 읽었다. **[계산]** 공식으로 계산했다. **[지식]** 학습 지식이며 확인하지 않았다. **[추정]** 근거는 있으나 확정하지 못했다.
- 행 번호는 HEAD 기준이다. `app/globals.css`와 `lib/blog-markdown.ts`는 블로그 세션이 편집 중이라 작업 트리에서는 행이 밀려 있다. 555행 이후는 셀렉터 이름으로 찾는다.
- 공개 범위: app·components의 .tsx 중 app/admin, app/api, components/admin, components/portal, components/notifications를 뺀 209개 파일.
- **canonical 쪽 절 번호 대응(값에는 영향 없음, canonical 쪽 참조를 이 번호로 동기화한다):** gap_triage의 'typography §2-5'(OG·공유 이미지 템플릿, 정적 Pretendard 보관소) → 이 문서 §2-1 'OG 이미지'. gap_triage의 'typography §2-6'(정적 랜딩 /l/* 폰트 통일) → §2-1 '정적 랜딩 폰트 통일'. C18의 '값은 typography §3-1 표' → §2-2 스케일 표. 토큰 CSS는 §2-5, 공개 스코프는 §3-1이다.

---

## 요약

- **서체는 Pretendard Variable 하나다(C20).** V1-A(2026-10-27 확정): jsDelivr 렌더 차단 대신 `public/fonts/pretendard-1.3.9/`에 업스트림 `.min.css`와 woff2 92조각을 자체 호스팅하고, 1년 immutable, 라틴 조각 preload 1개로 부른다(C04). 세리프는 V2-A(2026-10-27 확정)로 0바이트, 인용도 Pretendard 500이다. V18-A(2026-10-28)로 명조는 지금 다시 열지 않고, 인용 4개와 Manifesto 문구가 확정된 뒤 같은 보드로 재판정한다. 모노는 웹폰트 없이 시스템 스택이고 code·kbd·pre·samp와 결제 쿠폰 입력에만 쓴다. Paperlogy는 견적서 문서면 전용 예외로 고정한다.
- **스케일은 `text-*` 15종이다(C18):** poster · display · h1 · h2 · h3 · body-l · body · article · ui · caption · note · label · folio · numeral · quote. 정의는 `app/styles/tokens.css`의 `@theme inline` 한 곳이고, 자간은 `--trk-*` 간접 변수라 `(width < 40rem)`에서 한 번에 줄인 음수로 바뀐다(X02. 0이 아니다, RA-1). 굵기는 V13-A로 제목 600, poster(Manifesto)만 700이고, `text-h1`은 36→56px이다(TY-6). tailwind-merge 목록은 `lib/utils.ts` 한 곳이다.
- **사용처를 파일로 묶는다(C10):** `text-display`는 Hero H1, `text-poster`는 Manifesto 두 줄 전용이다. FinalCTA 제목은 h2에 `text-h1`이다.
- **잉크 밑줄은 모든 폭에서 `text-decoration` 하나다(C25).** `@utility ink-underline`은 모양만 갖고, 등장은 cards_motion §3-14가 색 페이드(V17-A: `--motion-beat` 뒤 `--motion-slow`, `--ease-fade`)로 준다. 줄이 바뀌면 줄마다 밑줄이 붙는다. ::after scaleX와 64rem 분기는 폐기했다.
- **Kicker는 Act·장 머리 전용이다(C22·X15).** V12-A(2026-10-28)로 바는 없고, 폴리오 → 12px → 먹 라벨이다. 섹션 머리의 그린은 0이다. folio는 필수이고 `null`은 Hero 한 곳만 허용한다. 홈은 Hero 1 + Act 01–06 = 7개다. 나머지 eyebrow는 대체하지 않고 지운다.
- **제목과 본문에 그린 구절은 없다(고급화 2026-10-28, CO-4).** 구절 강조는 굵기 대비나 잉크 밑줄(C25)만 쓴다. `heading-accent` 가드는 P2에서 warn 래칫으로 신설한다.
- **숫자는 정직하게(C08·X11·X14).** Numeral은 `lib/facts.ts`의 factId만 받거나, mock Frame 안에서 '예시'를 단 example만 받는다(X11. system §7의 '숫자 prop 없음' 문구는 이 예외에 맞춰 동기화한다, §3-7). 카운트업은 사이트 전체 0이다. ProblemCost는 숫자 없는 정성 장부 6행이다. 숫자 글리프는 표·가격 열·차트·폴리오·날짜에 `tabular-nums`, 단독 디스플레이 숫자(`text-numeral`)에 비례 숫자를 쓴다(X14 개정).
- **OG(C28):** 현재 코드에는 fonts 옵션이 없다(사실). 두 OG 경로가 `assets/fonts/pretendard-static/`의 Regular·Bold OTF를 Node에서 읽어 400·700으로 그린다. 이 경로는 아직 없고 C28 구현(T10) 때 만든다.
- **이번 개정에서 정정한 사실 2건:** ① 이전 판의 'OG는 Noto Sans KR 400으로 그린다'는 근거 없는 추정이라 삭제했다. ② CSP의 `cdn.jsdelivr.net`은 Next 페이지만이 아니라 `/l/meets-july`와 `public/classin-609-update.html`·`public/classin-calculator.html`도 쓰고 있어, 이 셋의 폰트 링크를 같은 PR에서 바꿔야 지울 수 있다[코드].

---

## 1. 원칙

공개 화면의 글자는 '잘 편집된 교육 전문지 지면'이다.

**서체와 위계**
- 서체는 Pretendard Variable 하나다. 같은 사이트 출처에서 내보낸다.
- 큰 제목은 크게 쓰되 가볍게 쓴다. 제목(display·h1·h2·h3)은 600이고, 위계는 크기 사다리(페이지 제목 h1 56 대 섹션 제목 h2 40), 폴리오 번호, 2px 잉크 밑줄이 만든다(V13-A · 2026-10-28).
- 굵기는 4단(400/500/600/700)이다. 300·800·900은 쓰지 않는다. 700은 Manifesto poster, 본문 strong, OG 이미지 제목(정적 OTF가 Regular·Bold 둘뿐이라 600을 700으로 매핑, C28 예외)에만 쓴다.
- 14px 이하에서 600은 라벨(`text-label`)·폼 라벨·버튼·'예시' 태그에만 쓴다. 그 밖의 작은 글자(바이라인·메타·출처 이름)는 400/500이다(RA-6, 래칫).
- 사이트에서 가장 크고 가장 굵은 글자는 Manifesto 포스터 두 줄 한 번뿐이다. 이 순간만 지면이 소리를 낸다.

**토큰**
- 크기·행간·자간·굵기는 이름 붙은 토큰으로만 쓴다. 색은 `text-fg-*`로만 쓴다(C02).
- 크기는 rem과 clamp라 390px에서 1440px까지 이어지고, 브라우저 확대와 Android 글자 크기를 따른다(iOS는 Aa 페이지 확대로 검증).
- 자간은 간접 변수라 모바일에서 한 곳만 줄인 음수로 바꾼다. 0으로 풀지 않는다(RA-1 · 2026-10-28).

**한국어 조판**
- 어절 단위로 줄을 바꾼다(keep-all). 헤딩은 balance, 긴 글은 pretty다.
- 가짜 굵게와 가짜 기울임은 없다(font-synthesis: none).
- 따옴표는 곡선 따옴표, 한국어 범위는 `~`, 숫자만 있는 라틴형 범위는 en dash `–`, 구분은 `·`다. 한글 낱말 사이 가운뎃점은 앞뒤 공백 없이 쓴다('전·중·후', TY-7).
- 본문 한 줄은 약 52자(38em)다.
- 공개 섹션의 h1/h2는 왼쪽 정렬이다. 가운데 정렬은 StateBlock·Dialog만 쓴다(그리드는 system §4-4, TY-1).

**숫자**
- 표·가격 열·차트·폴리오·날짜는 표처럼 정렬한다(`tabular-nums`). 단독 디스플레이 숫자(`text-numeral`)는 비례 숫자다(X14 개정 · 2026-10-28). 출처나 '예시' 없이 크게 쓰지 않는다. 카운트업은 하지 않는다.

**강조와 움직임**
- 강조는 한 지면에 하나다: 굵기 대비 또는 2px 잉크 밑줄(C25) 중 하나.
- h1–h3·display·poster 안의 그린은 0이다. 본문의 그린 구절도 쓰지 않는다(밑줄 없는 링크와 구분되지 않는다). 두 색 제목은 가운데 정렬 다음으로 강한 랜딩 템플릿 신호다. 가드 `heading-accent`를 P2에서 warn 래칫으로 신설한다(고급화 2026-10-28, CO-4).
- 움직이는 글자 요소는 잉크 밑줄의 색 하나뿐이다. 글자 자체(크기·자간·굵기·가변 wght)는 절대 움직이지 않는다.

**하한과 범위**
- 40~50대 원장이 읽는 지면이다. 읽는 글자는 13px 이상, `--fg-muted`(#615D59) 이상이고, 입력 글자는 16px 이상이다(C16).
- 수치 옆 '예시'는 14px/600, Numeral 출처 이름은 14px/500 `--fg-ink`다(14px 이하 600 제한, RA-6). 도판 캡션과 점선 태그의 정직 라벨은 imagery 규격(13px)을 따른다(C05·X11).
- 규칙은 `.site` 안에서만 작동한다(C17). /admin은 바뀌지 않는다.

---

## 2. 토큰 (CSS + Tailwind @theme)

### 2-1. 서체 토큰과 로딩

**패밀리: Pretendard Variable 단독(OFL 1.1)**
- 라틴은 Inter 기반이고, 같은 파일 안에서 x-height 0.530·cap 0.707로 한글과 맞춰져 있다. Inter·Geist·라틴 세리프(Instrument Serif·Newsreader·Fraunces)·Gilroy·손글씨·모노 웹폰트는 추가하지 않는다.
- 라틴 단어도 한글과 같은 굵기와 크기로 쓴다. 라틴 전부 대문자는 13px 이하 라벨 안의 약어(AI·HW)에만 쓰고 `tracking-abbr`(+0.06em)을 준다. 'AI' 표기도 이 규칙이다(C11, Sparkles 대체).
- 장식용 영문 슬로건은 삭제한다: `Hero.tsx:94-97` "Empower Education Online"(900·uppercase·0.12em).
- 전부 영문인 문장 블록에만 `lang="en"`을 붙인다.

**폰트 실측(Pretendard 1.3.9) [실측]**
- upm 2048. wght 축 45–400(기본)–930. ascender 0.9521em, descender 0.2412em, lineGap 0, x-height 0.530, cap 0.707. 업스트림 CSS가 선언한 범위는 복사본을 열어 확인하고 그 값을 따른다.
- 한글 음절 진행폭은 굵기와 무관하게 0.8643em, 공백 0.251em이다. 숫자는 비례폭이 기본이다(0 = 0.5957em, 1 = 0.4385em).
- GSUB: tnum, pnum, case, zero, frac, ss01~16, cv01~13, calt. **liga와 lnum은 없다.** 밑줄 위치 −0.126em, 두께 0.068em.

**OpenType 기능(TY-7 · RA-6, P2, 0바이트)**
- 숫자: 단독 Numeral은 기본 비례 숫자, 표·가격·폴리오·날짜는 `tabular-nums`(X14 개정, §3-7).
- `ss05`·`cv12`·`ss03`은 V1 자체 호스팅(C04, T1) 뒤 **실제로 전송되는 woff2**에서 기능이 있는지 확인하고, 보드에서 이득이 보일 때만 켠다. 위의 GSUB 목록은 TTF·OTF 실측이라 전송 조각과 같다고 단정하지 않는다.
- `font-feature-settings` 목록은 변수 하나에서만 관리한다. 이 속성은 합쳐지지 않으므로 자기 목록을 거는 요소(견적·시리얼 `ss06`)는 사이트 목록을 되풀이한다.

**폴백 비교 [실측]**
- Apple SD Gothic Neo 한글 0.865em — Pretendard와 0.08% 차이(모든 굵기). 수직 메트릭은 0.90/0.30으로 달라 같은 행간에서 기준선이 약 0.055em(72px에서 약 4px) 어긋난다. CLS에는 잡히지 않지만 swap 순간 글자가 튄다.
- SF 라틴 평균 0.448em, Pretendard 0.479em(약 7% 넓음). Noto Serif KR 500은 0.966em, MaruBuri SemiBold는 0.970em(한글 약 12% 넓음).

**로딩 — V1-A(2026-10-27 확정), 구현 A2(C04)**

기각: 방향 문서의 A1(`app/fonts` + CSS import)과 `next/font/local`. A1은 정적 랜딩(`app/l/*/route.ts`의 원시 HTML)이 해시 파일을 참조할 수 없고, layout이 해시 URL을 몰라 preload할 수 없다. `next/font/local`은 호출마다 family가 따로 생겨 92조각을 한 family로 묶을 수 없다.

1. `public/fonts/pretendard-1.3.9/`에 세 가지를 둔다.
   - `pretendardvariable-dynamic-subset.min.css`: 운영이 지금 jsDelivr에서 받는 것과 같은 파일.
   - `woff2-dynamic-subset/*.woff2` 92개(합 약 2.9MB, 저장소가 그만큼 커진다).
   - `LICENSE.txt`(OFL 원문).
   - 받는 법: `npm pack pretendard@1.3.9`로 받아 필요한 것만 꺼낸다(93MB 패키지는 설치하지 않는다). 업스트림은 2023-11 이후 동결이다.
   - **제자리 수정 금지.** 1년 immutable이라 재방문자에게 반영되지 않는다. 고쳐야 하면 `pretendard-1.3.9-r2/`를 새로 만들고 href·preload·헤더 source를 함께 바꾼다.
2. `app/layout.tsx:75-86`(preconnect·preload as=style·stylesheet 3개)을 아래 두 줄로 바꾼다.
   ```tsx
   <link rel="preload" href="/fonts/pretendard-1.3.9/woff2-dynamic-subset/PretendardVariable.subset.NN.woff2"
         as="font" type="font/woff2" crossOrigin="anonymous" />
   <link rel="stylesheet" href="/fonts/pretendard-1.3.9/pretendardvariable-dynamic-subset.min.css" />
   ```
   - `NN`은 추정하지 않는다. 스크립트로 복사본 CSS의 unicode-range를 읽어 `U+0020-007E`가 든 조각을 찾는다.
   - 같은 스크립트로 Hero H1과 내비 문구의 음절이 든 한글 조각을 **후보로만** 기록한다. 한글 조각 preload는 0단계 필름스트립에서 H1 안의 음절별 서체 혼재가 확인되고 LCP가 나빠지지 않을 때만 추가하고, 최대 3개다(C04).
   - 폰트는 CORS 모드로 받으므로 `crossOrigin`이 필요하다.
3. `next.config.ts` `headers()`에 `{ source: "/fonts/pretendard-1.3.9/:path*", headers: publicAssetCacheHeaders }`를 추가한다(88행 상수 재사용). `/fonts/:path*` 전체에는 걸지 않는다 — `public/fonts/paperlogy`까지 immutable이 된다.
4. CSP(`next.config.ts:63-64`)
   - `style-src`·`font-src`에서 `https://cdn.jsdelivr.net`을 지운다. **조건[코드]:** CSP 헤더는 `/(.*)` 전체에 걸려 있어 `public/l/meets-july/index.html`(jsDelivr 가변 CSS, 버전 미고정), `public/classin-609-update.html`(v1.3.9 static CSS), `public/classin-calculator.html`(v3.2.1 static CSS)도 이 CSP를 받는다. 이 세 파일의 링크를 같은 출처 CSS로 바꾸는 일을 같은 PR에 넣는다. 앞의 둘은 family 이름 `Pretendard`도 `Pretendard Variable`로 바꾼다.
   - `connect-src`의 jsdelivr(68행)도 같은 커밋에서 지운다. C04는 CSP 전체에서 `cdn.jsdelivr.net`을 지우라고 정했고, 남겨 두는 예외는 없다. 폰트 경로는 아니므로 T1 전에 공개 페이지 네트워크 기록에서 소비처를 확인한다. 소비처가 있으면 도메인을 남기지 않고, 그 소비처를 같은 출처로 옮기는 일을 같은 PR에 넣는다.
   - `fonts.googleapis.com`·`fonts.gstatic.com`은 정적 랜딩 폰트 통일(§2-1 정적 랜딩) 뒤에 지운다.

**효과와 대가**
- 사라지는 것: 제3자 DNS·TLS·CSS 왕복(렌더 차단 경로).
- 남는 것: 같은 출처 CSS 1요청(min 약 54KB, gzip 약 9KB [추정]).
- 첫 방문 바이트는 그대로다(홈 약 418KB). 가변 폰트라 굵기를 정리해도 바이트는 줄지 않는다.
- V1-B(시스템 우선)로 바꾸게 되면 파일·헤더는 그대로 두고 `--font-sans` 순서만 바꾼다(`-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo"`를 앞으로). 전환 비용은 0이다.

**font-display와 교체 체감**
- 업스트림 CSS는 `swap`이다. `optional`은 쓰지 않는다(느린 망 첫 방문에서 그 페이지 뷰 내내 브랜드 서체가 사라진다).
- 한글 진행폭 차이가 0.08%라 줄바꿈이 바뀌지 않고, 행간은 토큰이 고정해 박스도 움직이지 않는다. 남는 것은 ① 기준선 약 0.055em 튐 ② 첫 방문 4G에서 한글 조각이 순차 도착해 한 문장 안에서 음절별로 서체가 바뀌는 구간이다. ②가 H1에서 보이면 후보 한글 조각 preload를 늘린다.
- Windows Chrome 첫 방문에서 폰트 교체 layout shift가 0.02를 넘을 때만 맑은 고딕을 실측해 폴백 face를 채운다(§2-5 ⑤). iOS용 폴백 메트릭 재정의는 만들지 않는다.

**스택**(`--font-sans`, tokens.css `@theme inline`)
```
"Pretendard Variable", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo",
"Segoe UI", "Malgun Gothic", "Noto Sans KR", Roboto, sans-serif
```
- 설치형 이름 `Pretendard`는 뺀다. 운영자 맥에는 Pretendard(정적 9종 + 가변)·MaruBuri·Noto Serif KR이 설치돼 있어 웹폰트 로딩 중 폴백·교체·CLS가 그 맥에서는 보이지 않는다.
- `globals.css:34`의 `--font-sans`는 tokens.css로 **이동**한다. 남겨 두면 뒤에 오는 globals.css의 값이 이긴다[실측: 같은 키를 두 `@theme inline`에 두면 나중 것이 `--default-font-family`가 됨].
- body의 리터럴 font-family와 `font-feature-settings: "kern" 1, "liga" 1`(HEAD 421–422)은 지운다. 폰트에 liga가 없고 kern은 기본이다. preflight가 `html`에 `var(--default-font-family)`를 걸고, `@theme inline`의 `--font-sans`가 `:root --default-font-family`로 나간다[실측, Tailwind 4.1.18]. 첫 family가 같아서 어드민도 그대로다.

**보조 서체 — 허용 위치(C20)**

| 서체 | 허용 | 금지 |
|---|---|---|
| 세리프 | **없음(V2-A, V18-A로 유지).** V18 재판정에서 바뀔 때만 아래 V18-A 조건을 따른다. 기존 V2-B안은 Noto Serif KR 500을 `PullQuote` 인용문 본문에(페이지당 1~2개) | 헤딩, Display, Poster, 수치·가격·연대, 버튼, 내비, Kicker, 블로그 본문·blockquote, 폼 |
| 시스템 모노 `ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`(웹폰트 아님) | `code`·`kbd`·`pre`·`samp`, 결제 쿠폰 코드 입력(`CodeInputField.tsx:84`) | 수치(`hw/page.tsx:1037`), 연도(`AboutPageClient.tsx:606`), eyebrow, 스펙 표 → 모두 Pretendard `tabular-nums` |
| Paperlogy | 견적서 문서면(`components/portal/quotes/**`의 `quote-paper.module.css`) 전용 예외. 가드 허용 목록에 고정 | 그 밖 신규 사용 전부 |
| Pretendard 정적 OTF | OG 이미지(Node, `assets/fonts/pretendard-static/`) | 웹 페이지 |

**기존 V2-B 구현 메모(지금은 쓰지 않는다. V18 재판정에서 명조가 열리면 그 결과로 다시 쓴다)**
- `components/ui/PullQuote.tsx`에 `next/font/google` `Noto_Serif_KR({ weight: "500", display: "swap", preload: false, variable: "--font-quote-serif", fallback: ["AppleMyungjo", "Batang", "serif"] })`를 두고, figure에 `quoteSerif.variable` 클래스와 `font-[family-name:var(--font-quote-serif)]`를 함께 단다. 변수 클래스를 빠뜨리면 조용히 AppleMyungjo로 떨어진다.
- 확정 조건: ① 빌드 산출물 `.next/static/media`에 Noto Serif KR 한글 슬라이스가 실제로 있다(스크립트로 센다). ② 대표 인용 1개가 있는 페이지의 세리프 전송량이 300KB 이하다. 하나라도 어긋나거나 '공문 같다'는 인상이면 A로 확정한다.
- 세리프 한글은 약 12% 넓어 같은 인용이 약 1줄 는다. 크기 토큰은 바꾸지 않는다.
- V2-C(MaruBuri)는 권하지 않는다. 동적 텍스트에서 글리프가 빠지고 pyftsubset·라이선스 확인이 필요하다.
- V2-A에서는 `--font-quote` 같은 별도 토큰을 만들지 않는다(소비처 0).

**V18-A(2026-10-28) — 지금은 Pretendard 하나**
- V2-A를 유지한다. 바이트는 막는 이유가 아니고 시점이 문제다. 후기 인용을 다시 고르는 중이라 서브셋이 계속 바뀌고, 개발자 없이 문구를 고칠 수 없게 된다.
- 재판정 조건: 인용 4개와 Manifesto 문구가 확정(동결)된 뒤 같은 보드로 다시 판정한다(P5). 그 사이 굵기·자간(V13·RA-1)으로 얼마나 해결되는지 먼저 본다.
- 재판정에서 B(닫힌 목록 명조)가 이기고 문구가 동결된 경우에만 Manifesto·인용 2역할로 연다. 제목 체계 명조와 Latin 디스플레이 서체는 계속 금지다(C20).

**OG 이미지(C28 + 폴드: OG 템플릿·정적 Pretendard 보관소)**
- 사실[코드]: `app/opengraph-image.tsx:19`와 `app/api/og/blog/[slug]/route.tsx:54`는 `fontFamily: "sans-serif"`만 있고 `fonts` 옵션이 없다. 실제로 어떤 한글 글꼴로 그려지는지는 확인하지 않았다. 이전 판의 'Noto Sans KR 400' 서술은 삭제한다.
- **구현(2026-11-05 T10, 2026-11-06 카드 교체)**: `lib/og/template.tsx`(글꼴·로고 모듈 스코프 1회 로드)와 `assets/fonts/pretendard-static/`(Regular·Bold·OFL, pretendard 1.3.9)를 두고 두 OG 경로가 이 템플릿을 쓴다. 그 전에는 sans-serif 대체 글꼴 때문에 카카오톡 카드에서 띄어쓰기가 사라졌다('운영의새로운'). 카드 디자인은 2026-11-06 운영자 결정 C′ 로고 액자(DESIGN.md §9 V25)로 바뀌었다: 홈·기본 카드는 먹 단색 락업만, 블로그 카드는 같은 액자에 새 마크 · 카테고리(28/400 muted) · 제목(64/700 ink, 행간 1.3, 2줄)이다. 가운데 정렬 말줄임은 Satori 가 축을 밀어 `lib/og/fit-text.ts`가 줄바꿈·말줄임을 미리 정한다. 폭은 싣는 OTF 의 cmap·hmtx 실측값(`lib/og/font-metrics.ts`, 범주 400·제목 700), 글꼴에 없는 글자·이모지 묶음만 1em 어림이고, 줄은 grapheme 단위로만 나눈다. 글자 줄은 `flexShrink: 0`이라 혹시 넘쳐도 양옆이 같이 잘린다. 폰트·로고 추적은 `next.config.ts` `outputFileTracingIncludes`. 카드를 바꾸면 `lib/seo.ts` `OG_IMAGE_VERSION`을 올린다(기본 카드와 블로그 카드 `getBlogOgImagePath` 주소에 함께 붙는다). 배포 뒤 카카오 공유 디버거에서 OG 캐시를 지운다.
- 목표
  - `assets/fonts/pretendard-static/`에 `Pretendard-Regular.otf`·`Pretendard-Bold.otf`(Bold 1,576,660B [실측])와 OFL을 둔다. **이 경로는 아직 없다[코드]** — C28 구현(T10)에서 새로 만든다. SemiBold는 PDF 작업 때 추가한다.
  - `lib/og/template.tsx` 한 파일에 기본·블로그 두 변형을 둔다. 두 경로가 이 템플릿을 쓴다. 색은 `lib/design-tokens.ts`에서 import한다.
  - Node 런타임에서 `readFile(join(process.cwd(), "assets/fonts/pretendard-static/…"))`로 읽어 `fonts: [{ name: "Pretendard", data, weight: 400 }, { …, weight: 700 }]`를 넘기고 `fontFamily: "Pretendard"`로 한다. 600 요소는 700으로 매핑된다. 폰트 버퍼는 모듈 스코프에서 한 번만 읽는다(블로그 경로는 요청마다 다시 읽지 않는다). Satori는 woff2를 읽지 못한다.
  - 규격: 좌우 안전영역 96px, 제목 56px 이상·700·2줄 상한·수동 개행. 인라인 `letterSpacing`은 쓰지 않는다(`"-2.125px"`·`"0px"`·`"0.125px"` 삭제).
  - 'C' 배지(54행)는 폐기하고, 브랜드 원본이 오기 전까지 텍스트 워드마크를 쓴다.
  - `app/twitter-image.tsx`는 opengraph-image를 재수출하므로 함께 바뀐다.
  - 블로그 OG는 런타임 함수라, 배포본에서 폰트 파일이 함수 번들에 포함되는지 확인한다. 빠지면 `next.config`의 `outputFileTracingIncludes`에 그 경로를 더한다[추정: 파일 추적 누락 가능성].
  - 카카오·페이스북 공유 디버거 캐시 갱신을 배포 체크리스트에 넣는다.
  - P5(SY-4): 카카오톡·OG 카드(`opengraph-image`, `/api/og/blog`)를 paper 지면 · 먹 제목 · Kicker 라벨의 같은 언어로 다시 짠다. 폰트 규칙은 이 절(C28) 안에서 지킨다(400·700 두 파일, 600 요소는 700으로 매핑).

**정적 랜딩 폰트 통일(`public/l/*`, 담당 growth-crm)**
- 범위는 폰트만이다. 팔레트·레이아웃 이관은 백로그이고, kids·meets-july는 캠페인 테마 예외다.
- 생성물 4종(enterprise, managed, kids, online): HTML을 손대지 않고 `scripts/generate-segment-landings.mjs`를 고친 뒤 `node scripts/generate-segment-landings.mjs`로 재생성한다. 고칠 곳: 2608 `--font: Inter…` → 같은 출처 CSS 링크 + 위 스택, 4926 Georgia 삭제(상속), 5508 Google Fonts `@import` 삭제, 5530–5531 `--kids-font`/`--kids-serif` → `--font`, 7025 Fraunces 삭제.
- 손글 2종: omo1(Google Fonts Inter·Noto Sans KR·Noto Serif KR, `Gilroy` local face 34–38행)과 meets-july(jsDelivr 가변 Pretendard는 V1-A PR에서 이미 교체, Noto Serif KR 남음)는 HTML을 직접 고친다.
- 랜딩마다 커밋 1개로 하고, 바꾸기 전에 그 랜딩의 최근 4주 리드 기준선을 기록한다. 7일 합계가 −10% 이상이면 되돌린다(system §11).
- 6종 모두 Google 폰트 요청이 0건인 것을 확인한 뒤 CSP에서 googleapis·gstatic을 지운다.

### 2-2. 스케일(`text-*` 15종: 크기·행간·자간·굵기를 함께 든다, C18)

| 토큰 | 값 | 390px | 768px | 1440px | 굵기 | 행간 | 자간(≥40rem / <40rem) | 용도 |
|---|---|---|---|---|---|---|---|---|
| `text-poster` | clamp(3rem, 1.5rem + 6vw, 6.5rem) | 48 / 50.4 | 70.1 / 73.6 | 104 / 109.2 | 700 | 1.05 | −0.035em / −0.025em | **Manifesto 두 줄 전용**(Manifesto.tsx 밖 금지). 사이트의 유일한 700 제목 |
| `text-display` | clamp(2.5rem, 1.75rem + 3.2vw, 4.5rem) | 40.5 / 45.3 | 52.6 / 58.9 | 72 / 80.6 | 600 | 1.12 | −0.035em / −0.022em | **Hero H1 전용**(Hero.tsx 밖 금지) |
| `text-h1` | clamp(2.25rem, 1.75rem + 2.1vw, 3.5rem) | 36.2 / 43.4 | 44.1 / 53 | 56 / 67.2 | 600 | 1.2 | −0.03em / −0.018em | 하위 페이지 H1, StateBlock H1, **FinalCTA h2** |
| `text-h2` | clamp(1.75rem, 1.45rem + 1.2vw, 2.5rem) | 28 / 35 | 32.4 / 40.5 | 40 / 50 | 600 | 1.25 | −0.025em / −0.014em | 섹션 제목, **시뮬레이터 결과 금액** |
| `text-h3` | clamp(1.25rem, 1.15rem + 0.4vw, 1.5rem) | 20 / 28 | 21.5 / 30.1 | 24 / 33.6 | 600 | 1.4 | −0.01em / −0.006em | 카드 제목, 소제목, FAQ 질문 |
| `text-body-l` | clamp(1.0625rem, 1rem + 0.25vw, 1.1875rem) | 17 / 29.8 | 17.9 / 31.4 | 19 / 33.3 | 400 | 1.75 | 0 | 덱, 인용 벽 항목(500), 기사 blockquote(500) |
| `text-body` | 1rem | 16 / 28 | 같음 | 같음 | 400 | 1.75 | 0 | 본문, 카드 본문, LogoBar 이름(500) |
| `text-article` | 1.0625rem | 17 / 29.75 | 같음 | 같음 | 400 | 1.75 | 0 | 블로그·문서·자료 본문 |
| `text-ui` | 0.9375rem | 15 / 21 | 같음 | 같음 | **없음**(요소가 정함: 내비·탭 500, 버튼 600) | 1.4 | 0 | **컨트롤 전용**: 버튼 md, 내비, 탭(index-tab), 칩, ghost 링크. 카드·본문 금지 |
| `text-caption` | 0.875rem | 14 / 22.4 | 같음 | 같음 | 400 | 1.6 | 0 | 보조 설명, 바이라인, 폼 도움말, 폼 라벨(600), 수치 옆 '예시'(600), Numeral 출처 이름(500) |
| `text-note` | 0.8125rem | 13 / 19.5 | 같음 | 같음 | 400 | 1.5 | 0 | 출처 기준일, 각주, 도판 캡션(장면 설명·출처 라벨), 점선 태그 '예시 화면'(500), 차트 눈금, 푸터 법정 표기 |
| `text-label` | 0.8125rem | 13 / 18.2 | 같음 | 같음 | 600 | 1.4 | +0.02em(모바일 유지) | Kicker 라벨, 상태 라벨, 범주, 표 머리, '추천' 표기, 장부 모듈명, 사례 카드 지역·과목 |
| `text-folio` | 0.8125rem | 13 / 18.2 | 같음 | 같음 | 500 | 1.4 | 0 | Act 폴리오 01–06, 'No. 01', TocRow 폴리오, 그림 n(장문 전용). 항상 `tabular-nums` |
| `text-numeral` | clamp(2.5rem, 1.9rem + 2.4vw, 4rem) | 40 / 40 | 48.8 / 48.8 | 64 / 64 | 600 | 1.0 | −0.02em / −0.015em | Numeral 수치. **비례 숫자**(`tabular-nums` 없음, X14 개정) |
| `text-quote` | clamp(1.25rem, 1.1rem + 0.7vw, 1.625rem) | 20.3 / 32.5 | 23 / 36.8 | 26 / 41.6 | 500 | 1.6 | 0 | PullQuote(섹션당 1개) |

- 표의 각 칸은 '크기px / 행간px'이다.
- 굵기(V13-A · 2026-10-28): poster 700(Manifesto 한 곳), display·h1·h2·h3 600, numeral 600. 토큰 15종의 이름과 개수는 그대로다. 굵기를 낮춘 만큼 위계는 크기가 맡는다: `text-h1`을 36→56px로 키워(TY-6) 1440에서 h1:h2 = 1.4다. 요금 시뮬레이터(`/pricing/simulator`·`/pricing/simulator/krw`) 결과 금액은 `text-h2`다. /pricing 카드에는 금액이 없다(체크아웃·시뮬레이터 밖 공개 화면 금액 0, 2026-10-28).
- 자간 칸은 데스크톱 / 모바일(`width < 40rem`) 값이다. 모바일도 0이 아니다(RA-1, §2-3).
- 14px 이하에서 600은 `text-label`·폼 라벨·버튼(`text-ui`)·'예시' 태그에만 쓴다(RA-6). 소형 세미볼드는 가드 래칫으로 줄인다(§4-3).
- 15px(`text-ui`)는 컨트롤에만 쓴다. 기존 `text-[15px]` 120곳 중 버튼·내비·탭·칩은 `text-ui`로, 카드·본문 문장은 `text-body`(16)로 옮긴다. 버튼 cta 크기(52)의 글자 16/600은 controls가 정한다(C15).
- `text-note`·`text-label`의 모바일 14px 승격은 백로그다. 기본은 13px이다(C18).
- 크기 토큰 이름 `text-body`(크기)와 색 `text-fg-body`(색)는 `fg-` 접두로 늘 구분된다.

**확대(WCAG 1.4.4)** — 1440px 데스크톱에서 브라우저 200%(CSS 뷰포트 720) 실효 확대비 [계산]

| 토큰 | 본문 | 덱 | H3 | H2 | H1 | Display | Poster |
|---|---|---|---|---|---|---|---|
| 실효 확대비 | 2.0 | 1.87 | 1.77 | 1.59 | 1.54(h1 56 기준) | 1.42 | 약 1.25 |

- 큰 글자는 이미 커서 실사용 영향이 작다고 본다[추정]. 판정은 system §9의 확대 4상태 QA로 한다.

### 2-3. 자간·측정폭

**자간 원값(tokens.css `:root`, 고급화 2026-10-28 · RA-1·TY-2)**
- 데스크톱: `--trk-poster −0.035em`, `--trk-display −0.035em`, `--trk-h1 −0.03em`, `--trk-h2 −0.025em`, `--trk-h3 −0.01em`, `--trk-num −0.02em`, `--trk-label +0.02em`, `--trk-abbr +0.06em`.
- 모바일 재정의는 `@media (width < 40rem)` 하나에서 줄인 음수로 바꾼다: poster −0.025 · display −0.022 · h1 −0.018 · h2 −0.014 · h3 −0.006 · num −0.015em(X02. `width <= 40rem`·`max-width:640px`는 새로 쓰지 않는다). 0으로 풀지 않는다. 자간 0인 40~48px 한글 제목은 음절 사이가 떠서 기본 시스템 제목처럼 보인다. label·abbr는 13px 가독성 때문에 그대로 둔다. body-l·body·article·ui·caption·note는 모든 폭에서 0이다.
- 동작[실측]: `@theme inline`의 `--text-h1--letter-spacing: var(--trk-h1)`은 유틸에 `letter-spacing: var(--tw-tracking, var(--trk-h1))`로 나가므로 `:root` 미디어 재정의가 그대로 반영된다.
- 이 자간 값(데스크톱·모바일, §2-2 표의 자간 칸과 같다)이 정본이다. 표 밖 값과 −0.035em보다 좁은 자간은 쓰지 않는다(렌더 크기 기준 상한 단계는 없앴다, 2026-10-28). 양수 자간은 label(+0.02em)과 abbr(+0.06em)만 허용한다.

**레거시 공존(화면 변화 0 유지)**
- **정본 사실 정정 필요:** css_architecture는 `.tracking-*`와 h1–h4 모바일 `!important`를 '미사용 레거시'로 적었으나, 실측으로는 둘 다 쓰이고 있다(아래 숫자). 삭제 절차는 정본과 같다: 소비처를 이관해 grep 0건을 다시 확인한 뒤, 이관 단계마다 별도 커밋으로 지운다. css_architecture의 '미사용' 표기는 '이관 후 삭제'로 고친다.
- `.tracking-display/section/subhead/card`(globals.css HEAD 502–515, @layer utilities, 모바일 !important)는 docs 13곳·SegmentLandingPage 6곳을 `text-h*`로 옮길 때까지 그대로 둔다. 옮긴 뒤 grep 0건을 다시 확인하고 별도 커밋으로 지운다(T6). 같은 이름의 `--tracking-*` 테마 토큰은 만들지 않고, tw-merge에도 등록하지 않는다(C18).
- 전역 h1–h4 자간(HEAD 429–442, @layer base, 모바일 `letter-spacing: 0 !important`)은 **P2 첫 커밋**에서 어드민 전용 셀렉터(`.site` 밖)로 옮긴다(RA-1 · 2026-10-28, 열린 질문 7 결정). 공개 기준으로는 삭제, 어드민 기준으로는 변화 0이다(어드민 diff 0). 이 이관이 모바일 자간 표보다 먼저다. 레거시 `!important`는 레이어와 무관하게 이기므로, 남아 있으면 640px 이하의 h1–h4는 어떤 토큰 값과도 무관하게 0이고 모바일 자간 표가 효과 없이 머지된다. `text-*` 토큰이 붙은 요소는 이관 뒤 utilities 레이어가 이겨 토큰 자간을 받는다. 확인은 375·390에서 computed letter-spacing으로 한다.
- 그래서 이관 전에는 `text-label`을 h3·h4에 붙이면 모바일에서 라벨 자간이 지워진다. 이관 뒤에도 Kicker·라벨은 h3·h4로 렌더하지 않는다(하지 말 것).

**측정폭(`--container-*` → `max-w-*`)**

| 토큰 | 값 | 기준 크기에서 폭 | 한 줄 글자 수 |
|---|---|---|---|
| `max-w-measure` | 38em | 16px = 608px, 17px = 646px | 한글만 44음절, 혼합 약 52자 |
| `max-w-deck` | 34em | 19px = 646px | 혼합 약 47자 |
| `max-w-heading` | 18em | H2 40px = 720px | 혼합 약 25자 |
| `max-w-display` | 14em | 72px = 1008px | — (Hero 1–9칸 폭이 먼저 제한, V11-A. 캡처 커밋 뒤 V3-A면 7칸) |
| `max-w-quote` | 24em | 26px = 624px | 약 33자 |
| `max-w-page` · `max-w-article` | 1296px · 45rem | 값은 system §1 소유, 정의는 tokens.css `@theme inline` 한 곳(§2-5 ②, 7종 함께) | 기사 열 720px(이미지·표 폭) |

- 계산 근거: 한글 0.8643em, 공백 0.251em, 어절 평균 3.3음절[추정] → 글자당 0.722em.
- 현재: 블로그 본문 720px(17px) ≈ 59자, 문서 850px ≈ 69자.

### 2-4. tailwind-merge(C18 · naming 5, 설정 위치는 system)

`lib/utils.ts` 한 곳.
```ts
import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["poster", "display", "h1", "h2", "h3", "body-l", "body", "article", "ui", "caption", "note", "label", "folio", "numeral", "quote"],
      tracking: ["label", "abbr"],
      container: ["measure", "deck", "heading", "display", "quote", "page", "article"],
      ease: ["soft", "drift"],
    },
  },
})
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }
```
- 회귀 테스트는 `tests/lib/cn.test.ts` 하나다. 결과[실측, tailwind-merge 3.4.0]:
  - `cn('mt-4 text-h3 text-fg-ink')` → 셋 다 유지
  - `cn('text-body text-h3')` → `text-h3`
  - `cn('text-ui text-fg-muted')` → 둘 다 유지
  - `cn('border-line-hair border-line-control')` → `border-line-control`
  - `cn('max-w-measure max-w-2xl')` → `max-w-2xl`
  - 같은 테스트가 `text` 배열과 tokens.css의 `--text-*` 이름 집합이 같은지 확인한다(drift 방지).
- 확장 없이 토큰을 쓰면 `cn("text-h1 text-[#111110]")`이 `text-h1`을 지운다(현재 기본 twMerge [코드]). 그래서 tw-merge 확장은 토큰 첫 사용보다 먼저 머지한다.
- 새 text 토큰은 tokens.css와 이 목록을 같은 커밋에서 바꾼다.

### 2-5. 토큰 CSS

```css
/* ════════════════════════════════════════════════════════════════════════
   타이포그래피 — 편집 지면 · OS판 최종   (owner: typography)
   파일: app/styles/tokens.css · app/styles/utilities.css · app/styles/site-base.css
   색(--fg-*·--line-*)·.surface-ink 는 tokens.css 의 surfaces 블록(C01·X01), 모션 토큰은 X13.
   var() 폴백값 금지(X01).
   ════════════════════════════════════════════════════════════════════════ */

/* ① app/styles/tokens.css — @layer base 의 :root 블록 안, typography 구획
      (고급화 2026-10-28 · RA-1·TY-2. 이 표가 정본, 표 밖 값 금지 — §2-3) */
@layer base {
  :root {
    --trk-poster: -0.035em;
    --trk-display: -0.035em;
    --trk-h1: -0.03em;
    --trk-h2: -0.025em;
    --trk-h3: -0.01em;
    --trk-num: -0.02em;
    --trk-label: 0.02em;   /* 13px 가독 — 모바일 유지 */
    --trk-abbr: 0.06em;    /* 13px 이하 라벨 안 라틴 대문자 약어(AI·HW)만 */
  }
  @media (width < 40rem) {   /* 줄인 음수 — 0 아님. globals.css 레거시 h1–h4 !important 이관이 먼저(P2 첫 커밋) */
    :root {
      --trk-poster: -0.025em; --trk-display: -0.022em; --trk-h1: -0.018em;
      --trk-h2: -0.014em; --trk-h3: -0.006em; --trk-num: -0.015em;
    }
  }
}

/* ② app/styles/tokens.css — 단일 @theme inline 블록 안, typography 구획
      (globals.css:34 의 --font-sans 는 같은 커밋에서 삭제) */
@theme inline {
  --font-sans: "Pretendard Variable", -apple-system, BlinkMacSystemFont,
    "Apple SD Gothic Neo", "Segoe UI", "Malgun Gothic", "Noto Sans KR", Roboto, sans-serif;

  --text-poster: clamp(3rem, 1.5rem + 6vw, 6.5rem);          /* 48 → 104 · Manifesto 전용 · 유일한 700 제목(V13-A) */
  --text-poster--line-height: 1.05;
  --text-poster--letter-spacing: var(--trk-poster);
  --text-poster--font-weight: 700;

  --text-display: clamp(2.5rem, 1.75rem + 3.2vw, 4.5rem);    /* 40 → 72 · Hero H1 전용 */
  --text-display--line-height: 1.12;
  --text-display--letter-spacing: var(--trk-display);
  --text-display--font-weight: 600;

  --text-h1: clamp(2.25rem, 1.75rem + 2.1vw, 3.5rem);        /* 36 → 56 (TY-6) */
  --text-h1--line-height: 1.2;
  --text-h1--letter-spacing: var(--trk-h1);
  --text-h1--font-weight: 600;

  --text-h2: clamp(1.75rem, 1.45rem + 1.2vw, 2.5rem);        /* 28 → 40 · 시뮬레이터 결과 금액도 */
  --text-h2--line-height: 1.25;
  --text-h2--letter-spacing: var(--trk-h2);
  --text-h2--font-weight: 600;

  --text-h3: clamp(1.25rem, 1.15rem + 0.4vw, 1.5rem);        /* 20 → 24 */
  --text-h3--line-height: 1.4;
  --text-h3--letter-spacing: var(--trk-h3);
  --text-h3--font-weight: 600;

  --text-body-l: clamp(1.0625rem, 1rem + 0.25vw, 1.1875rem); /* 17 → 19 */
  --text-body-l--line-height: 1.75;
  --text-body-l--font-weight: 400;

  --text-body: 1rem;                                         /* 16 */
  --text-body--line-height: 1.75;
  --text-body--font-weight: 400;

  --text-article: 1.0625rem;                                 /* 17 */
  --text-article--line-height: 1.75;
  --text-article--font-weight: 400;

  --text-ui: 0.9375rem;                                      /* 15 · 굵기 하위키 없음 */
  --text-ui--line-height: 1.4;

  --text-caption: 0.875rem;                                  /* 14 */
  --text-caption--line-height: 1.6;
  --text-caption--font-weight: 400;

  --text-note: 0.8125rem;                                    /* 13 */
  --text-note--line-height: 1.5;
  --text-note--font-weight: 400;

  --text-label: 0.8125rem;                                   /* 13/600 */
  --text-label--line-height: 1.4;
  --text-label--letter-spacing: var(--trk-label);
  --text-label--font-weight: 600;

  --text-folio: 0.8125rem;                                   /* 13/500 + tabular-nums */
  --text-folio--line-height: 1.4;
  --text-folio--font-weight: 500;

  --text-numeral: clamp(2.5rem, 1.9rem + 2.4vw, 4rem);       /* 40 → 64 · 비례 숫자(X14 개정) */
  --text-numeral--line-height: 1;
  --text-numeral--letter-spacing: var(--trk-num);
  --text-numeral--font-weight: 600;

  --text-quote: clamp(1.25rem, 1.1rem + 0.7vw, 1.625rem);    /* 20 → 26 */
  --text-quote--line-height: 1.6;
  --text-quote--font-weight: 500;

  --tracking-label: var(--trk-label);
  --tracking-abbr: var(--trk-abbr);

  /* 측정폭 7종 — tw-merge container 목록(§2-4)과 1:1. 정의는 tokens.css 의 이 블록 한 곳뿐이다
     (naming 2 · css_architecture tokens.css ④ "--container-* 7종").
     measure~quote 는 em 이라 요소 자신의 글자 크기 기준(typography 소유).
     page·article 은 값의 소유가 system §1 레이아웃이고, system 스펙은 이 정의를 참조만 한다(다시 선언하지 않는다). */
  --container-measure: 38em;
  --container-deck: 34em;
  --container-heading: 18em;
  --container-display: 14em;
  --container-quote: 24em;
  --container-page: 1296px;
  --container-article: 45rem;
}

/* ③ app/styles/utilities.css — 모양만. 등장 모션은 site-base.css components(cards_motion 소유) */
@utility ink-underline {
  text-decoration: underline 2px var(--fg-accent);
  text-underline-offset: 0.14em;
  text-decoration-skip-ink: none;
}
@utility ink-underline-scrub {          /* Manifesto 둘째 줄 전용 — 정적 모양은 ink-underline 과 같다 */
  text-decoration: underline 2px var(--fg-accent);
  text-underline-offset: 0.14em;
  text-decoration-skip-ink: none;
}
/* white-space:nowrap 금지 — 줄이 바뀌면 줄마다 밑줄. forced-colors 에서는 text-decoration-color 가
   시스템 색으로 강제돼 밑줄이 남는다(추가 규칙 없음). 먹 위에서는 --fg-accent 가 세이지 #8FC4AC(C01·CO-3). */

/* ④ app/styles/site-base.css — (a) @layer base, typography 구획.
      파일 생성과 globals.css 의 @import 3줄은 tokens.css·utilities.css 와 같은 P0 PR(T2)이다(css_architecture 병합 순서).
      P0 에서는 이 구획이 비어 있고(화면 변화 0), 아래 규칙은 P1(T3)에서 채운다. */
@layer base {
  :where(.site) {
    overflow-wrap: break-word;          /* keep-all 은 기존 body(HEAD 426) 유지 */
    font-synthesis: none;               /* 가짜 굵게·기울임 금지 → italic 10곳은 정체로 */
  }
  :where(.site) :where(h1, h2, h3, h4) { text-wrap: balance; }
  :where(.site) :where(.text-article, .text-body-l, .text-quote, figcaption) { text-wrap: pretty; }
  :where(.site) :where(blockquote) { hanging-punctuation: first; }          /* Safari 만. PullQuote 는 모든 브라우저에서
                                                                              text-indent −0.45em 으로 매단다(TY-7, §3-6) */
  :where(.site) :where(em) { font-style: normal; font-weight: 600; }        /* 색은 상속(링크 안 em 보호) */
  :where(.site) :where(mark) {
    background: none;
    color: inherit;
    font-weight: 600;
    text-decoration: underline 2px var(--fg-accent);
    text-underline-offset: 0.2em;
    text-decoration-skip-ink: none;
  }
  :where(.site) :where(code, kbd, pre, samp) {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    font-size: 0.92em;
  }
  :where(.site) ::selection { background: rgb(8 71 52 / .14); color: #111110; }  /* CO-3 · paper 위 합성 #D7DFDA 13.9:1 */
  /* 먹 위: `.surface-ink ::selection` 을 세이지 알파 + 글자 #FAFAF8 로 재정의한다(값은 surfaces·C01 소유).
     재정의가 없으면 위 규칙이 먹 위 글자를 #111110 으로 고정한다. 공개 CSS 의 #D1FAE5·#6EE7B7·#065C41 은 0. */
}
/* 헤딩 자간은 base 규칙으로 주지 않는다 — text-h* 토큰이 붙은 요소에만. */
/* 같은 파일의 다른 소유 규칙(참조만): link-body 자동 적용 base 규칙(controls·X12),
   입력 16px 보증 `font-size:max(16px,1em)`(controls·C16, 무레이어 보증 블록),
   ink-underline 색 페이드·scrub(cards_motion §3-14·C25, components 의 no-preference 블록). */

/* ⑤ 조건부 — Windows 첫 방문 폰트 교체 layout shift > 0.02 일 때만(S 는 Windows 실측 후 기입).
   위치: tokens.css. --font-sans 두 번째에 "Pretendard Fallback" 삽입. Apple 기기는 local() 실패로 무시.
@font-face {
  font-family: "Pretendard Fallback";
  src: local("Malgun Gothic"), local("MalgunGothic");
  font-weight: 100 549;
  size-adjust: S;            // 86.43% ÷ 맑은 고딕 '가' 진행폭(em)
  ascent-override: A;        // 95.21% ÷ S
  descent-override: D;       // 24.12% ÷ S
  line-gap-override: 0%;
}
@font-face { …같은 값, src: local("Malgun Gothic Bold"); font-weight: 550 930; } */

/* ⑥ 삭제 대상(globals.css HEAD):
   34 --font-sans(→ tokens.css 로 이동) · 421–422 body font-family 리터럴·font-feature-settings  (P0)
   .animate-text-gradient(HEAD 713) — Hero·Manifesto·ProblemCost 그라데이션 제거 후            (P1)
   502–515 .tracking-* — docs 13 + SegmentLandingPage 6 이관, grep 0 재확인 후 별도 커밋        (P4)
   .blog-markdown 모바일 !important 블록(HEAD 824–856) — 렌더러 토큰화 후                       (P5)
   429–442 전역 h1~h4 자간·모바일 !important — P2 첫 커밋에서 공개에서 삭제하고 같은 커밋에서
     어드민 전용 셀렉터(.site 밖)로 이동해 어드민 diff 0(RA-1, 열린 질문 7 결정)                (P2)
   ※ css_architecture 는 .tracking-*·h1–h4 !important 를 '미사용'으로 적었으나 실측은 사용 중이다(§2-3). */
```

참고(소유: cards_motion §3-14, C25) — 잉크 밑줄 등장 CSS는 여기 복제하지 않는다. 위치는 site-base.css `@layer components`의 `@media (prefers-reduced-motion: no-preference)` 블록 하나다(`@layer components` 래퍼를 빼고 복사하면 무레이어 규칙이 되어 가드가 막는다, css_architecture (c)). 정본 요점:
- 키프레임 `@keyframes ink-fade { from { text-decoration-color: transparent; } }`.
- Hero: `[data-moment="hero-underline"] .ink-underline { animation: ink-fade var(--motion-slow) var(--ease-fade) var(--motion-beat) both; }`.
- 다른 페이지의 잉크 밑줄 1개: Reveal 조상 `[data-reveal="out"]`에서 투명, `[data-reveal="in"]`에서 `transition: text-decoration-color var(--motion-slow) var(--ease-fade) var(--motion-beat)`.
- Manifesto `ink-underline-scrub`: `[data-moment="manifesto"]` 안에서 `ink-fade` + `animation-timeline: view()`(범위·조건은 cards_motion §3-14).
- 동작은 색(투명도) 하나다. 이동·scaleX·::after는 없다. SSR·no-JS(CSS 애니메이션은 그대로 1회 재생)·reduced·미지원에서는 완성 상태다. Hero는 CSS 키프레임만 쓰고 JS는 0이다.
- V17-A(2026-10-28): Hero는 첫 프레임부터 정지해 있고 진입 애니메이션이 0이다(`hero-soft-enter` 삭제, cards_motion §3-15 ⑦). 첫 뷰포트에서 움직이는 것은 `--motion-beat`(240ms) 뒤 `--motion-slow`(900ms)에 걸쳐 스미는 이 밑줄 색 하나다. 곡선 `--ease-fade`는 `cubic-bezier(.33,1,.68,1)`이다.

---

## 3. 패턴과 값(데스크톱/모바일)

모바일 = 390×844 기준(`< 40rem`은 줄인 음수 자간), 데스크톱 = 1440×900 기준.

### 3-1. 공개 스코프(C17, system 소유 — 타이포 관점의 요점)

> **2026-11-03 갱신(DESIGN.md V20-A)** — 공개 화면 서체는 Pretendard 단독(§2-1)에서 IBM Plex Sans KR(+ Pretendard 폴백)로 바뀌었고, `text-h1`·`h2`·`h3`·`body-l`·`body`·`numeral`의 크기·행간·자간(§2-2 스케일 표)도 V20-A 값으로 교체됐다. 이 서체와 여섯 토큰 값의 현행 정본은 DESIGN.md §3이다. 이 문서의 해당 값은 이력으로만 읽는다. (옛 표기 '값은 typography §3-1 표'는 머리말 대응표대로 §2-2다.)

- 표지는 클래스 `site` 하나다. 붙는 곳: AppChrome 공개 분기의 `<div className="site contents">`(SSR), 공개 DialogContent 5곳(DemoModal, NewsletterModal, EventSignupModal, PublicLoginDialog, CheckoutRequestForm), 토스트 뷰포트(`!isInternalPath(pathname) && "site"`). `isInternalPath`는 `lib/internal-path.ts`로 옮긴다.
- display:contents라 박스가 생기지 않고, 상속과 `:where(.site)` 셀렉터는 그대로 작동한다.
- 타이포 쪽 추가 1건: AppChrome `<main>`(HEAD 122)의 `selection:bg-primary/20 selection:text-primary` 유틸은 utilities 레이어라 base의 `::selection`을 이긴다. 공개 분기에서는 이 두 클래스를 빼고, 비공개 화면에만 남긴다.
- `/checkout`·`/receipt` 본문은 스코프 밖이다(결제 요청 모달만 `site`). `/share` 견적 문서는 `.site` 안에 있지만 `quote-paper.module.css`(레이어 밖, 특이도 >0)가 base·보증 규칙을 이긴다. P0 스크린샷 diff로 확인한다.

### 3-2. 헤딩과 머리 블록

**배치 규칙**
- 페이지당 h1은 1개다.
- `text-display`는 Hero h1에만, `text-poster`는 Manifesto h2에만 쓴다. FinalCTA는 h2 + `text-h1`이다(C10).
- 다른 섹션 제목은 h2 + `text-h2` + `max-w-heading`이다.
- 공개 섹션의 h1/h2는 왼쪽 정렬이다. `text-center`는 StateBlock(404 등)·Dialog에만 쓴다(가드 0, TY-1). FinalCTA도 왼쪽 정렬이다.

**12칸 레일과 ChapterHead(TY-1 · 고급화 2026-10-28, P2 프리미티브 → P3–P5 적용)**
- 그리드 값은 system §4-4가 소유한다: 64rem 이상 12칸(칸 약 78, 간격 24). 레일 1–3(Kicker·목차·짧은 주), 본문 4–12, 여백 10–12(본문이 4–9일 때 캡션·출처). 64rem 미만은 1열 왼쪽 정렬이다.
- 글자 폭: 본문 칸 안에서 제목은 `max-w-heading`, 덱은 `max-w-deck`(34em), 본문은 `max-w-measure`(38em)로 막아 오른쪽 끝은 들쭉날쭉하게 둔다.
- ChapterHead(`components/ui/typography.tsx`, Kicker 옆) 순서: **masthead(1px 먹선, 12칸 전폭) → 레일 Kicker + 본문 H2 → 덱 → 본문.** 64rem 이상에서 Kicker는 레일, H2는 본문 칸에 나란히 두고 위 맞춤 ±4px을 허용한다(`text-box-trim`은 점진 적용). 64rem 미만은 Kicker를 H2 위에 쌓는다.

**머리 블록 간격**(system §1 · X04)

| 요소 | 모바일(< 64rem) | 데스크톱(≥ 64rem) |
|---|---|---|
| masthead(먹선 1px) → Kicker·헤딩 | padding-top 16 | 16 |
| Kicker → 헤딩 | 12(위아래로 쌓음) | 같은 줄(레일 / 본문 칸), 위 맞춤 ±4px |
| 헤딩 → 덱 | 16 | 20 |
| 머리 블록 → 본문 | 32 | 40 |

- 덱: `text-body-l max-w-deck text-fg-body`, 400.

**어구 묶기**
- 수동 `<br>` 대신 어구를 `<span className="inline-block">`으로 묶는다. keep-all과 balance가 어구 사이에서만 줄을 바꾼다.
- 어구가 한 줄보다 길면 inline-block 안에서 다시 줄이 바뀐다. 이때 잉크 밑줄은 줄마다 붙는다(text-decoration은 inline-block 자신의 글자에 적용된다).
- iOS 17.4 이하에는 balance가 없다. QA 매트릭스에서 고아 줄을 확인한다.

**Hero(V11-A 무도판 비대칭 표지 · V9-A · V17-A · C09, 2026-10-28)**

출처를 확인한 캡처가 커밋되기 전까지 Hero는 도판 없는 표지다. 따뜻한 종이 위에 크게 짠 한국어 제목 하나가 이 체계에서 가장 자신 있는 표지다. 이 결정은 V3 보충 문장('실제 화면 캡처를 확보하기 전에는 현재 도판을 유지한다')을 바꾼다(DESIGN.md §9 V3 행에 반영됨, 2026-10-28).

| 항목 | 모바일(< 64rem, 1단) | 데스크톱(≥ 64rem, 12칸) |
|---|---|---|
| 순서 | Kicker → H1 → 덱 → CTA 2개. 도판 0 | Kicker → H1(1–9칸, 크게) → 덱·CTA 2개(8–12칸, H1 마지막 줄 아래). 도판 0 |
| Kicker | `folio={null}`: 라벨 '수업 시스템 OS' 13/600 `text-fg-ink`만. 바 없음(V12-A) | 같음 |
| H1 | `text-display text-fg-ink` 40.5px/45.3, 600, −0.022em(−0.89px) | 72px/80.6, 600, −0.035em(−2.52px) |
| 예상 줄바꿈[계산, 시안 확인] | 390px(본문 폭 358): "좋은 수업을, / 강사의 개인기에서 / 학원의 시스템으로" 3줄. 320px에서는 둘째·셋째 어구가 폭과 거의 같아 어구 안에서 줄이 바뀔 수 있다 → 밑줄이 두 줄에 붙는 것이 정상 | 1–9칸 약 894px[계산] 안에서 어구 inline-block으로 줄을 나눈다. 줄 수는 V11 보드에서 확인한다 |
| 잉크 밑줄 | "학원의 시스템으로" 1구절, `inline-block ink-underline`. `--motion-beat` 뒤 색만 `--motion-slow`에 걸쳐 스민다(V17-A) | 같음 |
| 덱 | `text-body-l` 17px 400 `text-fg-body`, `max-w-deck` | 19px |
| 움직임 | 진입 애니메이션 0. 첫 프레임부터 정지(cards_motion 소유) | 같음 |
| LCP | H1 텍스트(도판 0) | 같음 |

- 출처를 확인한 EDB 판서 캡처(IM-3)가 커밋되면 V3-A 7/5 분할로 바꾼다: 왼쪽 7칸 Kicker → H1 → 덱 → CTA 2개, 오른쪽 5칸 capture Frame(gap 48). 그때 도판 로딩은 imagery가 정한다. 같은 이미지 파일은 페이지당 1회다.
- 출처를 확인하지 못한 도판에는 어떤 라벨도 짐작해 달지 않는다('AI 생성 이미지' 라벨 지시는 삭제했다). 캡처가 커밋되기 전까지 Hero 안 `[data-figure]`·`[data-frame]` = 0이다.
- 삭제: 글래스 ping pill(배지), 800/900, 인라인 −2.125px, 그라데이션 텍스트, drop-shadow 글자, `font-light text-white/82`, 영문 워터마크 "Empower Education Online", 현 도판 `hero-dashboard.webp`, 진입 클래스 `hero-soft-enter`.
- 홈에 영상 Hero는 없다. V3-B로 결정이 바뀌면 이 표를 다시 쓴다(열린 질문).

**Manifesto(먹 지면, 서사 모먼트 ②)**
- `<h2 className="text-poster text-fg-ink">` 안에 두 줄을 `block` span으로 둔다. 둘째 줄의 한 구절에 `ink-underline-scrub`.
- 제목 굵기 700은 사이트에서 이 두 줄에만 쓴다(V13-A, 본문 strong 700과 OG 이미지 제목 C28 예외는 별개). 크게 소리 내는 곳은 Manifesto 하나다.
- 모바일 48px/50.4, −0.025em(−1.2px) → 390px에서 "학원이 강사의 / 개인기에 / 의존해서는 / 안 됩니다." 약 4줄[계산, 시안 확인]. 데스크톱 104px/109.2, −0.035em(−3.64px) → 2줄.
- 브리지 문장: `text-body-l` 400 `text-fg-body`(먹 위 /.72).
- 교정: '안됩니다' → **'안 됩니다'**(About 148행과 통일). 정직성 핫픽스(H, P2 전)에서 먼저 고친다.
- 삭제: 900, 인라인 −0.05em, `clamp(3rem, 8.5vw, 8.5rem)`, 그라데이션 텍스트, `text-white/50 font-light`.

**FinalCTA(V5-A, sunken 띠)**
- rule-double(surfaces) → h2 `text-h1`(36→56, 600) → 덱 `text-body-l` → primary `size="cta"` + 텍스트 링크. 왼쪽 정렬(TY-1). Kicker 없음(Act가 아님).

### 3-3. 잉크 밑줄(C25)

| 항목 | 모바일 | 데스크톱 |
|---|---|---|
| 모양 | `text-decoration: underline 2px var(--fg-accent)`, offset 0.14em, skip-ink none | 같음 |
| 줄바꿈 | 줄마다 붙는다(320px, iPhone Aa 125/150%, 브라우저 200%) | 같음 |
| 등장 | 색 페이드 `--motion-slow`(900ms), 지연 `--motion-beat`(240ms), `--ease-fade`, 1회(V17-A · 2026-10-28, cards_motion §3-14 소유) | 같음 |
| 사용 수 | `ink-underline` 페이지당 1개(홈은 Hero) + `ink-underline-scrub` Manifesto 1개 | 같음 |
| 실패 대응 | iPhone Safari 실기기에서 색 애니메이션·스크럽을 확인하고, 실패하면 정적 밑줄로 둔다 | — |

**2px 그린 선 의미 사전(한 선이 두 뜻을 겸하지 않는다)**

| 선 | 뜻 | 정본 |
|---|---|---|
| 잉크 밑줄 | 이 페이지의 한 구절(+ Manifesto 1회) | C25 |
| mark 밑줄 | 기사 저자의 강조 | 이 문서 |
| index-tab 막대 | 현재 위치(탭·내비) | C12 |
| 좌측 2px 바 | 선택·현재 항목: Comparison Classin 열, /pricing 가이드가 고른 행, 세로 목차 현재 항목 | C21 |

- 'Kicker 바 16×2' 행은 V12-A(2026-10-28)로 지웠다. 섹션 머리에는 그린 선이 없다. 사전은 4가지 뜻이다.
- 자동 진행 괘선과 토스트 상태선은 없다(C07·C21). 긴 글의 1px 읽기 괘선은 허용이고, 그린 선이 아니며 cards_motion §3-16이 소유한다(§3-4).
- 비상호작용 그린 표지(잉크 밑줄·● 묶음·좌측 2px 바·차트 강조 계열·인용 여는 따옴표)는 뷰포트당 2개 이하다. 링크·버튼·포커스·index-tab은 세지 않는다(C11 개정, cards_motion 소유).

### 3-4. 본문·기사

| 항목 | 모바일 | 데스크톱 |
|---|---|---|
| 본문 | `text-body` 16/28 `text-fg-body`(#31302E, paper #F9F8F5 12.41:1) | 같음 |
| 기사 컨테이너 | `max-w-article`(이미지·표 열) + `text-article` 17/29.75 | 같음 |
| 기사 텍스트 블록 | `max-w-measure`(17px = 646px) | 같음 |
| 문단 간격 | 1.2em | 같음 |
| 기사 h2 / h3 | `text-h2` 위 2.5em 아래 0.6em / `text-h3` 위 2em | 같음 |
| blockquote | `text-body-l` 500 | 같음 |
| 캡션 | `text-note text-fg-muted` | 같음 |

- 별도 `.prose-ko` 같은 클래스는 만들지 않는다. 행간은 토큰이 든다. 전역 `p { line-height }`는 만들지 않는다.
- pretty는 `.text-article` 컨테이너에서 상속된다.
- 인라인 강조: em 600(정체), strong 700, mark 600 + 2px 그린 밑줄. 한 문단에 하나만, mark는 섹션당 1개.
- 레일 목차와 바이라인은 아래 장문 사다리가 정한다. 그 밖의 기사 전용 컴포넌트(Callout, Related, 코드 블록)는 블로그 세션 커밋 뒤의 article 스펙(백로그)에서 정한다.

**장문 사다리(블로그·docs, TY-9 · 고급화 2026-10-28, P5 — 블로그 세션 렌더러 커밋 뒤)**

| 순서 | 요소 | 값 |
|---|---|---|
| 1 | 레일 목차(64rem 이상, 레일 1–3) | 현재 항목은 C21 좌측 2px 바 |
| 2 | H1 | `text-h1`(36→56, 600) + `max-w-heading` |
| 3 | standfirst | `text-body-l text-fg-body max-w-deck` |
| 4 | 바이라인 | 위 1px hair, `text-caption text-fg-muted` '작성자 · 2026.10.26'(날짜는 `lib/format.ts` 메타 표기, tabular) |
| 5 | 본문 | `text-article` 17/1.75, `max-w-measure`(646px), 문단 간격 1.2em, H2 `text-h2` 위 2.5em |

- 그린 굵은 요약문은 금지한다. mark(600 + 2px 밑줄, 섹션당 1)로 바꾼다.
- 읽기 괘선(헤더 hair 위 1px, CSS 스크롤 타임라인)은 허용이고 cards_motion §3-16 소유다. ReadingProgress 3px JS 막대는 삭제한다.

**교열 기준(TY-9·TR-6, voice-charter §4 · 가드 system §5-4)**
- 큰 글씨의 띄어쓰기 오류와 과장어는 모든 시각 개선을 무효로 만든다. 이 기준은 공개 카피 전체에 쓰고, 1쪽으로 둔다.
- 띄어쓰기: '수밖에', '안 됩니다'(§3-11).
- 종결어미: 본문은 '-습니다'.
- 과장어 목록: 압도적, 차원이 다른, 최적화된, 검증된, 혁신, 완벽, 100%.
- 글자 예산: H2 ≤ 24자, 덱 ≤ 60자.
- 가드는 warn 래칫이고, 인용 데이터는 검사에서 뺀다(§4-3).

### 3-5. Kicker(Act·장 머리 전용, C22·X15 · V12-A 2026-10-28)

```tsx
// components/ui/typography.tsx (서버 컴포넌트) — ChapterHead(§3-2)가 레일에 둔다
export function Kicker({ folio, children, className }:
  { folio: string | null; children: React.ReactNode; className?: string }) {
  return (
    <p data-kicker="" className={cn("flex items-center gap-3 text-label text-fg-ink", className)}>
      {folio !== null && <span aria-hidden="true" className="text-folio tabular-nums text-fg-muted">{folio}</span>}
      <span>{children}</span>
    </p>
  )
}
```
- `folio`는 필수 prop이다. `folio={null}`은 Hero 한 곳에만 허용한다(가드). 실수로 빠뜨린 폴리오와 의도된 Hero가 타입과 가드에서 구분된다. Hero는 라벨 '수업 시스템 OS'만 쓴다.
- 구성(V12-A): 1px 먹 masthead 아래 레일에 폴리오 13/500 #615D59 tabular → 12px → 라벨 13/600 #111110 +0.02em. **바는 없다.** 섹션 머리의 그린은 0이고, 그린은 링크·버튼·현재 위치에만 남는다. 먹 위 색은 C01 토큰이 자동으로 바꾼다(라벨 `--fg-ink`, 폴리오 /.56).
- V9의 핵심(배지 pill을 지우고 Kicker로 대체)은 그대로다. 짧은 대시와 색 라벨은 가장 흔한 템플릿 eyebrow라서 뺐다. 괘선·번호·단어로 섹션을 여는 것이 편집물의 방식이다.
- 홈 Kicker = 7개(V10-A 목차): Hero('수업 시스템 OS') + 01 선언 · 02 공감(ProblemCost 정성 장부) · 03 흐름(OS 지도) · 04 화면 · 05 기록 · 06 확신(Comparison 비교표). '증거'는 예시 목업 위에 걸리므로 쓰지 않는다.
- 제품 페이지: 장 머리마다 1개.
- 그 밖의 섹션 eyebrow는 **대체하지 않고 지운다.** 그 섹션은 H2로 시작한다.
- 카드 메타에는 Kicker를 쓰지 않는다. 사례 카드의 지역·과목과 인덱스 카드 범주는 바 없는 `text-label text-fg-muted`(C11 개정, 그린 아님), 순서 있는 카드 묶음은 `text-folio` 'No. 01'. StateBlock(404 등)에도 Kicker는 없다.
- 금지: 그린 바·그린 라벨(V12-A), 대문자, 넓은 자간, pill, ping, 10·11px, h3·h4로 렌더(레거시 모바일 !important가 라벨 자간을 지움).

### 3-6. PullQuote와 인용 벽(V2-A · V18-A 유지)

```tsx
// components/ui/PullQuote.tsx (서버 컴포넌트, V18 재판정에서 명조가 열릴 때만 next/font 호출을 이 파일에 둔다)
export function PullQuote({ quote, attribution, context, excerpt, className }:
  { quote: string; attribution: string; context?: string; excerpt?: boolean; className?: string }) {
  return (
    <figure className={cn("m-0", className)}>
      <blockquote className="max-w-quote text-quote text-fg-ink">
        <p className="indent-[-0.45em]"><span className="text-fg-accent">“</span>{quote}”</p>
      </blockquote>
      <figcaption className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
        <span aria-hidden="true" className="w-6 shrink-0 border-t border-line-strong" />
        <span className="font-medium text-fg-ink">{attribution}</span>
        {context && <span className="text-fg-muted">{context}</span>}
        {excerpt && <span className="text-fg-muted">· 일부 발췌</span>}
      </figcaption>
    </figure>
  )
}
```

| 항목 | 모바일 | 데스크톱 |
|---|---|---|
| 인용문 | `text-quote` 20.3/32.5 500 | 26/41.6 |
| 측정폭 | 24em | 24em(624px, 약 33자) |
| 바이라인 | 24×1px `--line-strong` + attribution 14/500 `--fg-ink`(14px 이하 600 제한, RA-6) + context 14/400 `--fg-muted` | 같음 |

- 데이터 매핑(`lib/testimonials.ts` 8건, 24~74자 [실측]): `attribution`=서술형 익명 또는 실명(별표 마스킹 금지, X06 개정), `context`=`badge`. 동의 행이 없으면 렌더하지 않는다. `rating`은 렌더하지 않는다(별점 금지). 데이터에 따옴표를 넣지 않는다. 실명·기관명 노출 범위는 감사 D4를 따른다.
- 선정 기준: 인용은 운영 명사 1개와 바뀐 행동 1개가 있어야 고른다(X06 개정). 120자 이하는 컴포넌트 제약이 아니라 대표 인용 선정 기준이다. 원문을 줄였으면 `excerpt`로 '일부 발췌'를 단다.
- PullQuote는 섹션당 1개가 기본이다. 예외는 홈 05 기록 하나로, 고른 인용 4개 이하를 위 hair와 2단으로 놓는다(IM-8·TR-3, P3).
- 여는 따옴표는 본문과 같은 크기의 그린 “ 하나(기본). `text-indent: −0.45em`으로 측정폭 왼쪽 밖에 매단다(모든 브라우저, TY-7). 2.4em 확대안은 V18 재판정 보드의 비교 칸에만 둔다. 이 따옴표는 비상호작용 그린 표지로 세며 뷰포트당 2개 예산 안에 든다(C11 개정).
- 인용 벽 항목(여러 개): `text-body-l` 500 + 같은 바이라인. 22rem 열에서 26px은 한 줄 19자로 너무 짧아 PullQuote 크기를 쓰지 않는다. 05 기록 2단의 칸 폭에서 어느 크기를 쓸지는 P3 보드에서 이 기준으로 정한다.
- 금지: 이탤릭, 박스, 따옴표 아이콘(`TestimonialWall.tsx:4` Quote), 회색 바탕, 좌측 컬러 바.

### 3-7. Numeral·숫자·ProblemCost(C08·X11·X14, system §7)

```tsx
// components/ui/typography.tsx (서버 컴포넌트)
import { FACTS, type FactId } from "@/lib/facts"   // FactId = keyof typeof FACTS (system §7 이 export)

type NumeralProps =
  | { factId: FactId; className?: string }                                          // 출처 있는 사실만
  | { example: { value: string; unit?: string; label?: string }; className?: string } // mock Frame 안에서만(가드)

export function Numeral(props: NumeralProps) {
  const fact = "factId" in props ? FACTS[props.factId] : null
  const d = "factId" in props ? FACTS[props.factId] : props.example
  return (
    <div className={cn("border-t border-line-strong pt-4", props.className)}>
      <p className="text-numeral text-fg-ink">{/* 비례 숫자 — tabular-nums 없음(X14 개정) */}
        {d.value}
        {d.unit && <span className="ml-[0.08em] text-[0.5em] font-semibold">{d.unit}</span>}
        {!fact && <span className="ml-2 align-middle text-caption font-semibold text-fg-ink">예시</span>}
      </p>
      {d.label && <p className="mt-2 text-caption text-fg-body">{d.label}</p>}
      {fact && (
        <p className="mt-1 text-note text-fg-muted">
          <span className="text-caption font-medium text-fg-ink">
            {fact.source.href ? <a className="link-body" href={fact.source.href}>{fact.source.name}</a> : fact.source.name}
          </span>
          {" · "}{fact.asOf.replace("-", ".")} 기준
        </p>
      )}
    </div>
  )
}
```

| 항목 | 모바일 | 데스크톱 |
|---|---|---|
| 수치 | `text-numeral` 40/40 600, −0.015em, 비례 숫자 | 64/64, −0.02em, 비례 숫자 |
| 단위 | 0.5em 600(20px) | 32px |
| '예시'(example만) | 14/600 `--fg-ink`, 수치와 같은 줄 | 같음 |
| 출처 줄 | 이름 14/500 `--fg-ink` · 기준일 13 `--fg-muted` | 같음 |

- 숫자 prop을 받는 경로는 example 하나뿐이고, 그 경로는 mock Frame 파일에서만 쓸 수 있다(가드).
- **정본 문구 충돌(동기화 필요):** system_spec_brief §7의 'Numeral·ScaleFacts·Stat은 factId만 받고 숫자 prop은 받지 않는다'는 X11('Numeral example의 '예시'')과 글자 그대로는 맞지 않는다. 이 스펙은 X11을 따른다. system §7 문구는 'Numeral·ScaleFacts·Stat은 factId만 받는다. 예외는 Numeral example 하나이며 mock Frame 안에서만 쓴다'로 고친다(system 스펙 소유). ScaleFacts·Stat에는 example 경로가 없다.
- 출처 이름·기준일 검증은 `tests/lib/facts.test.ts`가 한다(빈 이름, `/^(예시|샘플|추정)$/`, 12개월 초과, '○○').
- '○ 예시'는 '예시'로 바꾼다. ○●–는 상태 표시 전용이다(C05·X11). Frame 밖 수치 묶음은 캡션 '수치는 예시입니다'(imagery).
- 카운트업은 사이트 전체 0이다. 수치는 SSR 정적 값이다.
- 각주 번호(`<sup>`)는 출처 있는 수치가 3개 이상인 행에서 쓴다(C24 범위 안). system §5-5 개정(고급화 2026-10-28)으로 지금 만든다: P2에서 Numeral에 각주 prop을 더한다. 첫 사용처는 홈 05 기록의 EEO 수치 한 줄(160+개국, 5,000만+ 교육자·학습자, 월 3,000만+ 수업. `lib/facts.ts` source 'EEO 공식 소개(classin.com)', asOf '2026-06')이고, 같은 뷰포트에 13px(`text-note text-fg-muted`) 각주 '¹ EEO 공식 소개(classin.com) 기준 … 국내 도입 실적이 아닙니다'를 단다. 6만+ 기관·2억+ 누적은 About에만 싣는다.

**ProblemCost(02 공감, V10-A 목차) — 정성 장부(C08 · V4-A)**
- paper 위 6행(sheet 상자 없음, surfaces 지면 3역할 · 2026-10-28): 칠판 · 교안 · 녹화 · LMS · 학생 관리 · 관리자 데이터.
- 각 행: `○`(꺼진 상태 점, icons/cards 소유) + 모듈명 `text-label text-fg-ink` + 질문형 문장 `text-body text-fg-body`. 행 구분은 1px `--line-hair`.
- 숫자 열·합계 이중선·카운터는 0이다. 기존 20%·1,200만원·3개월·85%(출처 없음, 감사 D3)와 CountUp은 지운다.
- 6행의 이름과 순서는 03 흐름 OS 지도 노드와 같다. 꺼진 `○` 여섯 칸이 03 흐름에서 `●`로 켜진다(MO-2, P3. 라벨 배열 동일성 단위 테스트).
- 교정: '수 밖에' → **'수밖에'**. 정직성 핫픽스(H, P2 전)에서 먼저 고친다.
- `lib/facts.ts`에 출처·기준일이 있는 수치가 생기면 장부 위에 `<Numeral factId>` 1개를 정적 값으로 둘 수 있다.

| 항목 | 모바일 | 데스크톱 |
|---|---|---|
| 행 | 모듈명 위, 문장 아래(세로 쌓기), 행 높이 콘텐츠 기준 | 모듈명 칼럼(약 12em) + 문장 칼럼 |

**숫자 서식(X14 개정 · system §8, 고급화 2026-10-28)**
- 표·가격 열·차트·폴리오·날짜 메타는 `tabular-nums`다. 단독 디스플레이 숫자(`text-numeral`)는 Pretendard 기본 비례 숫자다. 64px에서 tabular는 '1' 둘레에 약 10px 빈틈을 만들어(1 = 0.4385em 대 tnum 0.5957em) 권위 있게 보여야 할 숫자를 성기게 만든다. `lining-nums`와 `.num` 클래스는 만들지 않는다(Pretendard에 lnum이 없고 기본이 라이닝).
- 견적·시리얼 번호는 `[font-feature-settings:'ss06']`(I/l/1 구분).
- 표기 함수는 `lib/format.ts`(Asia/Seoul): 표·가격 '1,200,000원', 문장 '1,200만 원', 날짜 메타 '2026.10.26', 문장 날짜 '10월 26일(월)'. 퍼센트는 붙여 쓰고('34%'), 음수는 U+2212.

### 3-8. 링크(X12 — controls 소유, 글자 관점 요약)

| 종류 | 평상시 | hover(hover 기기) · focus-visible | 대비 |
|---|---|---|---|
| 본문 `link-body` | `--fg-accent`, 밑줄 1px · offset 0.22em · `decoration-line-link`(.6) | `--fg-accent-hover`(#073D2D, 밝아지지 않고 짙어짐), 밑줄 currentColor, 진입 `--motion-fast` 160ms · 이탈 `--motion-base` 320ms(V17-A) | 글자 10.71 / 10.08:1(white / paper #F9F8F5). 밑줄 3.51 / 3.43 / 3.36(white / paper / sunken #F3F2EE) [계산] |
| 내비·푸터 `link-quiet` | 같은 기하, 밑줄 transparent | 밑줄 currentColor | 위치·목록 맥락이 링크임을 알린다 |
| ghost 버튼(X03) | `--fg-accent` `text-ui` 600 + 1px 밑줄 + ArrowRight 16 | 밑줄 currentColor, `--fg-accent-hover` | 같음 |
| 먹 위(#1A1917) | `--fg-accent` 세이지 #8FC4AC, `--line-link` rgb(143 196 172 / .6) | 같은 세이지 | 8.92:1, 밑줄 약 4.0:1 [계산] |

- 그린 상태값은 CO-3(고급화 2026-10-28, 값은 surfaces·C01 소유)을 따른다. 공개 CSS에서 #6EE7B7·#065C41은 0이다. hover 시간표(기본 `duration-(--motion-base)` + `hover:`·`focus-visible:duration-(--motion-fast)`, 진입 160 · 이탈 320ms)는 cards_motion(V17-A) 소유다.

- 본문 링크와 본문 글자의 색 대비는 1.23:1(#31302E)이라 평상시 밑줄이 필수다(1.4.1).
- 클래스 없는 본문 앵커(`p, li, dd, td, figcaption, blockquote > a:not([class])`)는 site-base base 규칙이 `link-body`를 적용한다. 블로그 렌더러 앵커(`lib/blog-markdown.ts:104·112`의 `underline underline-offset-4`)는 클래스를 지워 이 규칙에 맡긴다.
- 카드 제목에는 밑줄도 색 변화도 없다(C13). 이전 판의 `.link`·color-mix·카드 제목 40% 밑줄은 폐기했다.

### 3-9. 라벨·캡션·폼 글자

| 요소 | 값 | 비고 |
|---|---|---|
| 폼 라벨 | `text-caption font-semibold text-fg-ink`(14/600) | `ui/label.tsx:8`의 `leading-none`은 공개 사용에서 행간 1.6(토큰)으로. 두 줄 라벨 겹침 방지 |
| 도움말 | `text-caption text-fg-muted` | |
| 오류 | 14/500 `text-fg-danger`(#B43E3E 5.68:1, 먹 위 #E89A94) | |
| 입력 글자 | 16px 이상 — site-base 보증 블록 `:where(.site) :where(input…, select, textarea){font-size:max(16px,1em)}`(controls 소유, C16) | 공개 모달 5종 포함. 어드민 14px 그대로 |
| 플레이스홀더 | `placeholder:text-fg-placeholder`(#78736D, sheet 위 4.70:1. paper #F9F8F5 위 4.42라 sheet 위에만) | 냉색 #8A948D·#A39E98 퇴출(controls 공동) |
| 표 머리 | `text-label text-fg-muted`(`Comparison.tsx:68`의 `text-xs uppercase #A39E98` 대체) | 추천 열은 머리 '추천' `text-label text-fg-ink`(그린 아님) + 셀 600 `--fg-ink`(C21) |
| 탭·내비 | `text-ui` 500 고정, 비활성 `--fg-muted`, 활성 `--fg-ink`(C12) | 굵기 전환 없음 |
| 푸터 법정 표기 | `text-note` 먹 위 `--fg-muted` | controls §3.6 |
| LogoBar 이름 | `text-body` 500 `--fg-muted`, 정적 목록(X16) | 앞 점 없음. X16 개정(2026-10-28): 숫자·'외 N곳' 없이 공개 동의를 받은 이름만 가나다순, 6곳 미만이면 렌더하지 않음. 지면은 paper 띠 + hair |
| 여백 칸 캡션(TY-8, ≥64rem, 전폭이 아닌 도판) | 설명 `text-note text-fg-muted` 60자 이하 → 출처 라벨 13/500 `--fg-ink`. 여백 칸(10–12) 아래 맞춤 | 제품 장(P4)·About만, 홈은 대상 아님. 64rem 미만과 전폭 도판은 도판 아래 캡션. 규격 소유는 imagery(Figure prop은 P2) |

### 3-10. 먹 지면(`.surface-ink`) 위 글자

값은 C01 블록이 정하고 여기서는 쓰임만 적는다. 클래스 `surface-ink` 하나로 배경과 `--fg-*`·`--line-*`가 함께 뒤집힌다.

먹 면은 V15-A(2026-10-28)로 `--surface-ink` #1A1917이다. 글자 `--fg-ink` #111110과 masthead #111110은 그대로이고, 면과 글자를 분리한다(surfaces 소유).

| 역할 | 토큰 | 값 | 대비(먹 #1A1917) [계산] |
|---|---|---|---|
| 헤딩 | `text-fg-ink` | #FAFAF8 | 16.81 |
| 본문 | `text-fg-body` | rgb(250 250 248 / .72) | 9.14 |
| 보조·플레이스홀더 | `text-fg-muted` · `placeholder` | / .56 | 6.00 |
| 장식·비활성(글자 금지) | `--fg-faint` | / .40 | 3.7 |
| 액센트·hover | `text-fg-accent` | 세이지 #8FC4AC(CO-3) | 8.92 |
| 오류 | `text-fg-danger` | #E89A94 | 7.93 |
| 금지 | #084734 글자 | — | 1.64 |

- 먹 위 selection은 세이지 알파 + 글자 #FAFAF8이다(`.surface-ink ::selection` 재정의, §2-5 ④).
- **밝은 지면(paper·sheet·sunken)에서는 알파 글자를 쓰지 않는다.** `#1a1a1a/.60`조차 paper #F9F8F5 위 4.48로 경계값이다. 반드시 불투명 `--fg-*`를 쓴다.
- 먹 위 읽는 글자의 최저는 `--fg-muted`(/.56)다. `text-white/20~40` 같은 리터럴 알파는 쓰지 않는다.

### 3-11. 표기 규칙

- 따옴표 “ ” ‘ ’. 한국어 범위는 `~`(예: 3~5명). 숫자만 있는 라틴형 범위는 en dash `–`(2024–2026, 01–06). 구분은 `·`.
- 가운뎃점(TY-7 · 2026-10-28): 한글 낱말 나열에서는 앞뒤 공백 없이 쓴다('전·중·후', '전 · 중 · 후'가 아님). 메타 줄의 구분자(바이라인 '작성자 · 날짜', 출처 '이름 · 기준일')는 공백을 둔다.
- 맞춤법: '안 됩니다', '수밖에'. 공개 카피 grep `안됩니다|수 밖에`가 0이어야 한다(사용자 입력 검색어 `lib/docs.ts`는 제외). 정직성 핫픽스(H) 게이트는 소스 grep이 아니라 하이드레이션 뒤 렌더 텍스트를 브라우저 도구로 검사한다.
- 교열 기준(띄어쓰기·종결어미·과장어·글자 예산)은 §3-4.
- 번호 체계는 한 페이지 2종 이하다(C24). 각주 번호(¹)도 이 2종 안에서 센다(system §5-5 개정 'C24 범위 안'). 홈은 Act 폴리오 01–06과 05 기록의 각주 번호 2종이다. 순서 있는 카드 묶음의 'No. 01'은 2종을 넘게 되는 페이지에서는 쓰지 않는다. '그림 n'은 도판 3개 이상인 장문 페이지(블로그·docs·제품 장문)에만 쓰고, 홈·탭·캐러셀 안 도판에는 번호가 없다(C05). 주석 마커는 a·b 글자(capture Frame 전용)이고 ①②는 쓰지 않는다.

---

## 4. 사용 규칙과 대상 파일

### 4-0. 현재 상태 [실측]

| 항목 | 수 | 비고 |
|---|---|---|
| 인라인 `letterSpacing` | 46~47회 / 30파일 | 헤딩 아닌 요소엔 모바일 0 규칙(HEAD 435–441)이 닿지 않는다(예: Manifesto −0.05em) |
| `tracking-[..]` | 239 | 대부분 eyebrow 0.12~0.3em |
| `tracking-wide/wider/widest` | 71 | |
| `tracking-display/section/subhead/card` | 19 | docs 13, SegmentLandingPage 6. 모바일 !important로 0 |
| `uppercase` | 176 | 한글에 효과 없고 넓은 자간만 남음 |
| 굵기 | light 3 · normal 5 · medium 171 · semibold 481 · bold 449 · extrabold 22 · black 40 · 인라인 fontWeight 7 | 7단 혼재 |
| `text-xs~9xl` | **1,033** | sm 318 · lg 114 · base 102 · 2xl~5xl 약 290 · 6xl~8xl 21 · xs 133 |
| `text-[Npx]` | **약 900** | 13px 210 · 12px 191 · 11px 133 · 15px 120 · 14px 89 · 10px 46 · 16px 32 |
| 13px 미만 읽는 글자 | 약 500 | 10·11·12px 370 + 읽는 `text-xs` 일부 |
| `text-[#A39E98]` | 193 | paper 위 2.54:1 |
| 밝은 지면 알파 `text-[#1a1a1a]/30~55` | 47 | /45 = 2.89, /50 = 3.34, /55 = 3.89 |
| 먹 위 알파 `text-white/20~40` | 46 | 1.84 / 2.22 / 2.67 / 3.21 / 3.82 |
| `<br>` / `break-keep` | 78 / 88 | body에 keep-all(HEAD 426)이 있어 break-keep은 전부 중복 |
| `text-balance` / `text-pretty` | 2 / 0 | |
| `italic` | 10 | Pretendard 이탤릭 없음 → 가짜 기울임 |
| `font-serif` / `font-mono` | 2 / 3 | contact:352·390, hw/page:1037, About:606, CodeInputField:84 |
| 맞춤법 | 2 | Manifesto.tsx:41 '안됩니다', ProblemCost.tsx:102 '수 밖에' |
| 출처 없는 수치 | 4 | ProblemCost: 20%, 1,200만원, 3개월, 85% |
| 새 토큰 이름(`text-body` 등) 기존 사용 | 0 [코드] | P0 토큰 추가 시 화면 변화 0의 근거 |

### 4-1. 파일별 변경 지도

| 파일(행) | 현재 | 변경 | 단계 |
|---|---|---|---|
| `public/fonts/pretendard-1.3.9/**`(신규) | — | `.min.css` + woff2 92 + LICENSE | T1 |
| `app/layout.tsx:75-86` | jsDelivr preconnect·preload·stylesheet | 라틴 preload 1 + 같은 출처 stylesheet | T1 |
| `next.config.ts:63-64·68`, `headers()` | CSP jsdelivr·Google Fonts | `/fonts/pretendard-1.3.9/:path*` immutable, style/font/connect-src jsdelivr 삭제(T1, C04), googleapis·gstatic 삭제(T11) | T1·T11 |
| `public/l/meets-july/index.html` · `public/classin-609-update.html` · `public/classin-calculator.html` | jsDelivr Pretendard | 같은 출처 가변 CSS(+ family 이름 `Pretendard Variable`) | T1 |
| `app/styles/tokens.css`(신규, system P0) | — | §2-5 ①② | T2 |
| `app/styles/utilities.css`(신규, system P0) | — | §2-5 ③ | T2 |
| `app/styles/site-base.css`(신규, system P0) | — | 파일 생성·import는 T2(빈 typography 구획, 화면 변화 0). §2-5 ④ 규칙은 T3에서 채운다 | T2·T3 |
| `app/globals.css` `@import` 3줄 | — | `@import "tailwindcss";` 바로 아래에 tokens·utilities·site-base 3줄(css_architecture). 세 파일과 같은 P0 PR | T2 |
| `app/globals.css:34` · `:421-422` | `--font-sans`(설치형 이름 포함) · body 리터럴·kern/liga | tokens.css로 이동 · 삭제 | T2 |
| `app/globals.css` `.animate-text-gradient` · `502-515` · `.blog-markdown` 모바일 블록 · `429-442` | 레거시 | §2-5 ⑥ 순서대로 삭제(`.animate-text-gradient` T3, 429–442는 P2 첫 커밋에서 공개 삭제 + 어드민 전용 이동(T4, RA-1), 502–515 T6(grep 0 재확인 후 별도 커밋), `.blog-markdown` T7) | T3·T4·T6·T7 |
| `lib/utils.ts` · `tests/lib/cn.test.ts` | 기본 twMerge | §2-4(system 소유, 목록은 이 스펙) | T2 |
| `components/AppChrome.tsx:122` | main `selection:` 유틸 | 공개 분기에서 제거(§3-1) | T3 |
| `app/styles/tokens.css` · `app/styles/site-base.css`(P2 토큰 PR) | P0 값 | 자간 표(데스크톱·모바일), 굵기(V13), `text-h1` 36→56, selection(CO-3) | T4 |
| `components/ui/typography.tsx`(신규) · `components/ui/PullQuote.tsx`(신규) | — | Kicker(V12-A, 바 없음)·ChapterHead(TY-1)·Numeral(비례 숫자·각주 prop) / PullQuote(따옴표 매달기·attribution 500) | T4 |
| `components/sections/Hero.tsx:39-64, 94-97` | 글래스 ping pill, 800/900, −2.125px, 그라데이션, drop-shadow, font-light, 영문 워터마크, `hero-dashboard.webp` 도판 | §3-2 Hero(V11-A 무도판 표지) | T3(빼기)·T5 |
| `components/sections/Manifesto.tsx:21-23, 37-41, 51` | 900, −0.05em, clamp 48–136px, 그라데이션, white/50 300, '안됩니다' | §3-2 Manifesto | T3·T5 |
| `components/sections/ProblemCost.tsx:46-64, 100-102, 140, 204, 236-250` | 900, −1.5px, 그라데이션, 출처 없는 수치 4 + CountUp, '수 밖에' | §3-7 정성 장부, `text-h2` | T3·T5 |
| `components/sections/FinalCTA.tsx` | — | h2 `text-h1`, 왼쪽 정렬 | T5 |
| `components/ui/PageHeader.tsx:20` | extrabold, 인라인 −0.03em | `text-h1` | T5 |
| eyebrow(아래 목록) | 10–13px uppercase 0.12–0.3em, 일부 pill | Act 머리만 `<Kicker folio="0n">`, 나머지 삭제 | T5·T6 |
| 인용: `TestimonialWall.tsx:71-73, 98-100, 132-133` · `CaseStudies.tsx:190-193` · `ScienceBased.tsx:78,143` · `sw/page.tsx:685` | 이탤릭, 회색 박스, white/30 cite, 별점 | 대표 1개 PullQuote, 나머지 인용 벽 항목, rating 비표시 | T5·T6 |
| `Comparison.tsx:68` | `text-xs uppercase #A39E98` | `text-label text-fg-muted` | T5 |
| `LogoBar.tsx` | 마키·eyebrow | `text-body` 500 `--fg-muted` 정적 목록(X16, cards_motion 소유) | T5 |
| `app/pricing/page.tsx:12` | 2.35rem 600 tracking-tight | `text-h1`(1440 2줄 이하, 390 3줄 이하, TY-6) | T6 |
| `app/contact/page.tsx:352, 390` | `font-serif` slate | `text-h1` / `text-h3` | T6 |
| `app/product/hw/page.tsx:1037` · `app/about/AboutPageClient.tsx:606` | `font-mono` 수치·연도 | `tabular-nums` / `text-folio` | T6 |
| `app/product/sw/page.tsx:183-191, 720-760` | EyebrowTag 11px 0.2em | 장 머리만 Kicker. TypographyHookSection의 2px 바는 이 페이지의 `ink-underline` 1개로 | T6 |
| `app/product/ai-report/page.tsx` | Eyebrow pill | 장 머리 Kicker(구조·카피는 유지, C26) | T6 |
| `components/docs/*`(tracking-* 13) · `components/landing/SegmentLandingPage.tsx`(6) | 레거시 `.tracking-*` | `text-h*` → 레거시 블록 삭제 | T6 |
| `lib/blog-markdown.ts` `:104,112` 링크 · `:119` mark · `:121` em · `:218` 캡션 · `:364,374` h2·h4 · `:393` blockquote · `:407,421,450,462` 본문 | `text-[17px] leading-8`, `tracking-[-0.03em]`, 파스텔 mark, 캡션 #1a1a1a/45, 그린 굵은 요약문 | 컨테이너 `text-article`, 블록 `max-w-measure`, `text-h2`/`text-h3`, blockquote `text-body-l` 500, 앵커 클래스 삭제, mark 클래스 삭제, 캡션 `text-note text-fg-muted`, 그린 굵은 요약 → mark(§3-4 장문 사다리) | T7 |
| `app/blog/[slug]/page.tsx` | — | 장문 사다리(레일 목차·standfirst·바이라인, TY-9) | T7 |
| `components/docs/DocsArticle.tsx:115, 119, 142, 146` | 900, 850px, #4F4C49 | `text-h1`·`text-h2`, `text-article max-w-measure`, `text-fg-body` | T7 |
| 알파·faint 글자: `EventsClient.tsx:123,388` · `updates/page.tsx:213` · `Footer.tsx:83` · `DashboardPreview(Charts).tsx` 외 | #1a1a1a/30–55 47, white/20–40 46, #A39E98 193 | 밝은 지면 `text-fg-muted`, 먹 위는 `surface-ink` 안 `text-fg-muted`. hex→hex 치환 금지, hex→토큰만. Footer·SW·HW 다크 구간의 surface-ink 이관이 먼저(system §11) | T8 |
| `components/ui/input.tsx:15` · `textarea.tsx:15` · `label.tsx:8` · `marketing-form.tsx:6` | 14·15px, #8A948D·#A39E98, leading-none | §3-9. 크기는 보증 블록이 처리, 어드민 무변화 | T8 |
| `app/opengraph-image.tsx` · `app/api/og/blog/[slug]/route.tsx` · `lib/og/template.tsx`(신규) · `assets/fonts/pretendard-static/`(신규) | `sans-serif`, fonts 옵션 없음, 'C' 배지, 인라인 자간 | §2-1 OG | T10 |
| `scripts/generate-segment-landings.mjs:2608, 4926, 5508, 5530-5531, 7025` + 재생성 · `public/l/{omo1,meets-july}/index.html` | Inter·Gilroy·Fraunces·Georgia·Google Fonts | §2-1 정적 랜딩 | T11 |
| `scripts/check-design-tokens.mjs` | admin/branch만 검사 | §4-3 규칙 묶음(system §6 확장 안) | T2 |

**eyebrow 목록**
- 홈: `EraVision.tsx:49,94`, `SolutionOverview.tsx:121`, `HomeLeadMagnet.tsx:83`, `GlobalScale.tsx:24`, `HomeEntitySummary.tsx:24`, `LogoBar.tsx:44`, `FAQ.tsx:41`, `Outcomes.tsx:81,92`, `TestimonialWall.tsx:39`, `ScienceBased.tsx:59,124`, `DashboardPreview.tsx:127`
- HW 13곳: `PainPointsV2:58`, `BigBackdropImage:82`, `LatencyProof:64,80`, `ValueAnchor:77,123`, `SizeChooser:51`, `OpeningStatement:71`, `ClassroomStudioSection:53,88`, `AfterClassSection:61`

### 4-2. 쓰지 말아야 할 곳

- 읽기 면(블로그·문서·법무·폼)에는 Display, Poster, Numeral, 잉크 밑줄, 세리프를 쓰지 않는다.
- `.site` 밖(어드민, `/checkout`·`/receipt` 본문)에는 공개 base 규칙이 닿지 않는다.

### 4-3. 가드 규칙 묶음(system §6의 `scripts/check-design-tokens.mjs`에 들어갈 타이포 항목)

형식은 system §6(`{id, glob, pattern, message, allow, severity, errorFrom}`, warn 2주 뒤 규칙별 error, `scripts/design-baseline.json` 래칫)을 따른다.

- 파일 패턴(공개 glob)
  - `letterSpacing` 인라인, `tracking-\[`, `tracking-(wide|wider|widest)`
  - `font-(black|extrabold|light|thin)`
  - `\btext-(xs|sm|base|lg|xl|[2-9]xl)\b`, `\btext-\[\d+(\.\d+)?(px|rem)\]`
  - `\bitalic\b`, `\buppercase\b`(라틴 약어 허용 목록 제외)
  - `font-serif`(V18 재판정에서 명조가 열릴 때만 해당 파일 허용, 그 전에는 0), `font-mono`(code 렌더러·CodeInputField만 허용)
  - `text-\(--` 임의값 문법(C02)
  - `text-display`는 `components/sections/Hero.tsx`만, `text-poster`는 `components/sections/Manifesto.tsx`만, `folio=\{null\}`은 Hero.tsx만
  - `<Numeral example`은 mock Frame 허용 파일만
  - `text-label`·`<Kicker`가 `<h3`·`<h4`에 붙은 경우
  - 맞춤법 `안됩니다|수 밖에`
- P2 신설 가드 5개(고급화 2026-10-28, system §6과 같은 목록) — 모두 오류로 올리지 않는 **warn 래칫**이다. 타이포 몫은 아래 4개이고, `radius-allowlist`(반경 0·6px·원형)는 system 소유라 참조만 한다.
  - `heading-accent`: h1–h3와 `text-display`·`text-poster` 요소 안의 `text-fg-accent`(CO-4. 지금 가드에는 없다). 헤드라인 문구 수정은 라우트 PR마다 나눈다
  - `text-center-heading`: 공개 h1/h2의 `text-center`(`components/sections`·`app/product`, StateBlock·Dialog 제외, TY-1)
  - `small-semibold`: `text-caption`·`text-note`와 함께 쓴 `font-semibold`(폼 라벨·'예시' 허용 파일 밖, RA-6)
  - `hype-words`: 과장어(공개 JSX 문자열, 인용 데이터 파일 제외): 압도적·차원이 다른·최적화된·검증된·혁신·완벽·100%(§3-4 교열 기준, system §5-4)
- 같은 P2에 위 파일 패턴 묶음에 더하는 타이포 패턴(warn 래칫, 신설 가드 5개에는 세지 않는다)
  - 한글 사이 ` · `(앞뒤 공백 있는 가운뎃점, TY-7)
  - `[data-kicker]` 안의 `bg-fg-accent`(V12-A)
  - `public/l/**`·`public/*.html` 안 `fonts.googleapis|fonts.gstatic|cdn.jsdelivr`(T11 뒤 error)
  - `Paperlogy`는 `components/portal/quotes/**`만
- `--budget` 모드(프리렌더 HTML /, /product/sw, /product/hw, /pricing): `.ink-underline` 라우트당 ≤1, `.ink-underline-scrub` 사이트 ≤1(홈), 홈 `[data-kicker]` = 7(Kicker가 이 속성을 렌더한다).
- 그린 뷰포트 예산(비상호작용 그린 표지 ≤2)은 소스 가드가 섹션당 개수로 근사하고, 뷰포트 개수는 검증 하네스 스크린샷으로 확인한다(CO-4·RA-2, SY-1).
- 대비 리터럴(`text-[#A39E98]`, `text-[#1a1a1a]/\d+`, `text-white/(1\d|20|25|30|35|40)`)은 system의 hex·알파 규칙이 잡는다.

---

## 5. 접근성·대비

**대비표[계산]**(white / paper #F9F8F5 / sunken #F3F2EE — V15-A 2026-10-28 지면 값, WCAG 2.x)

| 글자·선 | white | paper | sunken | 용도 |
|---|---|---|---|---|
| #111110 `--fg-ink` | 18.89 | 17.79 | 16.87 | 헤딩, Kicker 라벨, '예시'·출처 이름 |
| #31302E `--fg-body` | 13.18 | 12.41 | 11.77 | 본문 |
| #615D59 `--fg-muted` | 6.53 | 6.14 | 5.82 | 보조(DESIGN.md '~5.5' 정정) |
| #78736D `--fg-placeholder` | 4.70 | 4.42 | 4.19 | 입력(sheet 위에만) |
| #A39E98 `--fg-faint` | 2.66 | 2.50 | 2.37 | 장식·비활성만, 글자 금지 |
| #084734 `--fg-accent` | 10.71 | 10.08 | 9.56 | 링크·버튼·현재 위치 |
| #073D2D `--fg-accent-hover`(CO-3) | 12.25 | 11.53 | 10.93 | 링크 hover(짙어짐) |
| #B43E3E `--fg-danger` | 5.68 | 5.35 | 5.07 | 오류 |
| `--line-link` green .6 | 3.51 | 3.43 | 3.36 | 링크 밑줄(비텍스트 3:1 충족, .4는 약 2.2로 미달) |
| #8A857F `--line-control`(V15-A) | 3.66 | 3.44 | 3.26 | 입력 경계 등(C23) |

- 밝은 지면 selection은 rgb(8 71 52 / .14) 합성 #D7DFDA 위 #111110 13.9:1이다(CO-3).
- P2 게이트(`tests/design/surface-contrast.test.ts`)는 조작 경계 ≥3.2, muted ≥5.5(밝은 지면), 먹 위 읽는 글자 ≥4.5로 기준을 올린다(surfaces 소유).

먹 위 값은 §3-10.

**판정 방법**
- axe-core color-contrast 0건 + 가드의 알파·faint 글자 0건.
- 사진·도판 위 글자는 자동 도구가 '수동 확인'으로 넘긴다. 남는 경우는 대표 프레임 실측표로 판정한다. 풀블리드(HW BigBackdrop)는 폐기되고 plate 위에는 글자를 두지 않는다(imagery). Hero는 V11-A 무도판 표지라 도판 위 글자가 없다.

**동작 줄이기·no-JS**
- 글자 자체(크기·자간·굵기·가변 wght)는 어떤 상황에서도 애니메이션하지 않는다.
- 잉크 밑줄은 reduced·미지원에서 정적 완성 상태다. no-JS에서도 CSS 애니메이션이라 정상 재생 후 완성된다.
- 글자·단어 단위로 쪼개는 애니메이션은 금지다.

**스크린리더**
- Kicker의 폴리오는 aria-hidden이다(바는 V12-A로 없다). 어구 inline-block은 낭독에 영향이 없다.
- '예시'는 텍스트라 낭독된다. mock Frame의 sr-only 요약은 imagery 소관.

**확대·간격(system §9)**
- 크기 토큰은 rem이라 브라우저 확대와 Android 글자 크기를 따른다. iOS Safari는 Dynamic Type을 웹 rem에 반영하지 않아 Aa 페이지 확대로 검증한다.
- 확대 4상태(Android 글꼴 최대, iOS Aa 150%, 브라우저 200%, 텍스트 간격 사용자 CSS: 행간 1.5·자간 0.12em·단어 간격 0.16em)에서 헤딩·본문의 잘림·겹침·가로 스크롤 0. 여러 줄 텍스트 컨테이너에 고정 높이를 두지 않는다. line-clamp는 전문으로 가는 링크가 있을 때만.

**forced-colors**
- 잉크 밑줄·mark·링크 밑줄은 text-decoration이라 시스템 색으로 남는다. Kicker는 바 없이 글자만이라 잃는 것이 없다.

**언어**: `<html lang="ko">` 유지, 전부 영문인 블록에만 `lang="en"`.

**QA 환경**
- 폰트 판정은 Pretendard·MaruBuri·Noto Serif KR이 설치되지 않은 기기(iPhone 실기기 또는 macOS 새 계정)에서 한다. mac Chrome DevTools Rendered Fonts에 웹폰트 'Pretendard Variable'이 보이는지 확인한다.
- 매트릭스: iPhone 최신 iOS, iOS 17.4(balance 없음), Windows Chrome, DPR1 1366×768, Chrome 200% at 1440, iPhone Aa 125/150/200%, 320px 폭, 카카오톡 인앱.
- 모든 보드와 게이트는 iPhone 실기기와 Windows Chrome 1366×768 DPR1(ClearType) 두 환경에서 본다(SY-1). 600 제목·줄인 음수 자간의 한글 획은 ClearType·DPR1에서 따로 확인한다. computed style 검사는 저장소 의존성 밖 브라우저 도구로 하고 새 devDependency는 0이다.

---

## 6. 성능 예산

| 항목 | 예산 | 현재 |
|---|---|---|
| 공개 Next 페이지 제3자 폰트·CSS 요청 | 0 | jsDelivr CSS 1 + woff2 16–21 |
| 정적 랜딩 6종 + `public/*.html` 제3자 폰트 요청 | 0(T11 뒤) | Google Fonts·jsDelivr |
| 첫 방문 Pretendard woff2 전송 | `/` ≤ 420KB · `/product/hw` ≤ 525KB · `/blog` ≤ 555KB · `/pricing` ≤ 270KB | 418 · 524 · 553 · 269KB |
| 재방문 폰트 요청 | 0(1년 immutable) | jsDelivr 캐시 의존 |
| font preload | 라틴 1개(40KB 이하). 한글은 필름스트립 근거가 있을 때만 최대 3개 | CSS preload 1 |
| @font-face CSS | gzip 12KB 이하, 같은 출처 1요청 | 교차 출처 렌더 차단 |
| 세리프 | V2-A·V18-A: 0B. V18 재판정(P5)에서 명조가 열려도 인용·Manifesto가 있는 경로만, 그 외 0B. 기존 V2-B 상한은 300KB | — |
| P2 토큰 PR 전후 폰트 요청 | 세리프 woff2 0, Pretendard 조각 세트 동일(자체 호스팅 뒤 같은 출처로 이동). 굵기·자간 개정(V13·RA-1)의 바이트 영향 0(가변 폰트) | — |
| 폰트 교체 layout shift | 0.02 이하(iPhone 4G, Windows Chrome 첫 방문), 전체 CLS 0.05 이하 | 미측정 |
| H1 서체 교체 시점 | 기준선 대비 악화 0(필름스트립) | 미측정 |
| LCP(H1 텍스트, 홈은 V11-A로 도판 0) | 기준선 대비 악화 0, 랩 +0.3s 이상이면 되돌림(system §11). P2 게이트: Lighthouse 모바일 3회 중앙값 악화 <0.3s | 미측정 |
| 긴 기사 레이아웃 시간(Safari 26) | pretty 전후 차이 10% 이하. 넘으면 pretty를 `.text-body-l`·`.text-quote`로 축소 | 미측정 |
| 타이포 런타임 JS | 0B(프리미티브는 서버 컴포넌트, 밑줄은 CSS) | 섹션 다수가 framer 의존 |
| OG | 루트 OG 빌드 출력 정적(○), 블로그 OG는 폰트를 인스턴스당 1회만 읽음 | 폰트 번들 없음 |

---

## 7. 마이그레이션(S/M/L)

system §11 단계(P0 화면 변화 0 → P1 빼기 → P2 프리미티브·셸 → P3 홈 Act → P4 제품 → P5 콘텐츠·전환)에 맞춘다. 고급화(2026-10-28)로 P2 앞에 **H 정직성 핫픽스**와 **P2-0 결정 보드**가 붙는다(로드맵 H → P2-0 → P2 → P3 → P4 → P5). P2-0 게이트: V10–V18 선택이 DESIGN.md §9에 기록되기 전에는 P2 토큰 PR을 머지하지 않는다. 다른 세션이 globals.css를 수정 중이면 그 커밋이 들어간 뒤 시작한다.

- **[S] T0. 기준선(P1 14일 기준선의 일부, 저장소 변경 없음)**
  - iPhone 실기기 4G(Safari Web Inspector)에서 /, /product/hw, /blog, /pricing을 3회씩: LCP, CLS, 폰트 전송량 중앙값.
  - Slow 4G 필름스트립: Hero H1 서체 교체 시점, 한 문장 안 음절별 혼재 구간.
  - Windows Chrome 첫 방문 CLS 1회. Safari 26 Timeline 긴 블로그 글 레이아웃 시간.
  - 운영자 맥은 Pretendard가 설치돼 있어 측정에서 뺀다.
- **[S] T1. V1-A 폰트 자체 호스팅(독립 PR, 화면 변화 0)**
  - `npm pack pretendard@1.3.9` → `.min.css`, woff2 92, OFL만 꺼낸다. 스크립트로 라틴 조각 번호 확정, 한글 후보 조각 기록.
  - layout 3줄 → 라틴 preload 1 + 같은 출처 stylesheet. headers에 `/fonts/pretendard-1.3.9/:path*`.
  - meets-july·classin-609-update·classin-calculator의 jsDelivr 링크를 같은 출처로 바꾸고, CSP의 style/font/connect-src에서 jsdelivr를 모두 지운다(C04). connect-src 소비처가 확인되면 같은 PR에서 같은 출처로 옮긴다.
  - 파일: `public/fonts/pretendard-1.3.9/**`, `app/layout.tsx`, `next.config.ts`, `public/l/meets-july/index.html`, `public/classin-609-update.html`, `public/classin-calculator.html`
- **[S] T2. P0 토큰·tw-merge·가드(화면 변화 0)**
  - 3파일(tokens.css → utilities.css → site-base.css)과 globals.css의 `@import` 3줄을 한 PR로 넣는다(css_architecture 병합 순서). tokens.css에 §2-5 ①②, utilities.css에 ③(미사용 상태). site-base.css는 파일과 레이어 골격만 두고, typography 구획(§2-5 ④)은 비워 둔다(T3에서 채움). globals.css:34 `--font-sans` 이동, 421–422 삭제. 레거시 `.tracking-*`·h1–h4 자간은 손대지 않는다.
  - `lib/utils.ts` tw-merge + `tests/lib/cn.test.ts`(system 소유 작업, 이 스펙의 목록 사용).
  - 가드에 §4-3 규칙을 warn으로 넣고 베이스라인 기록.
  - DESIGN.md 사실 정정(Inter→Pretendard, '~5.5:1'→6.24:1, #A39E98 용도)과 결정 로그 V1·V2. V15-A 지면 값(paper #F9F8F5)으로는 muted가 6.14:1이고, 그 갱신은 T4(P2 토큰 PR)에서 한다.
  - 수용: P0 스크린샷 diff 0(/, /product/sw, /product/hw, /pricing, /blog, /contact, /share 1건, /admin 2건).
  - 파일: `app/styles/tokens.css`, `app/styles/utilities.css`, `app/styles/site-base.css`(골격), `app/globals.css`(`@import` 3줄 포함), `lib/utils.ts`, `tests/lib/cn.test.ts`, `scripts/check-design-tokens.mjs`, `scripts/design-baseline.json`, `DESIGN.md`
- **[M] T3. P1 공개 조판 기본값 + 빼기(화면 변화 있음)**
  - T2에서 만든 site-base.css의 base typography 구획에 §2-5 ④를 채운다. AppChrome main의 `selection:` 유틸을 공개 분기에서 제거.
  - 빼기: Hero·Manifesto·ProblemCost의 그라데이션 텍스트(→ `.animate-text-gradient` 삭제), drop-shadow 글자, Hero 글래스 ping 배지.
  - 승인 관문: /, /docs, /blog/[slug], /l/test1, DemoModal 열림 상태를 390·768·1440 전후 스크린샷으로 승인받은 뒤 머지. 예상 변화: balance 줄바꿈, 이탤릭 → 정체, em 600, mark 밑줄, 입력 14·15→16px(controls 보증 블록과 같은 PR).
  - 파일: `app/styles/site-base.css`, `components/AppChrome.tsx`, `components/sections/Hero.tsx`, `components/sections/Manifesto.tsx`, `components/sections/ProblemCost.tsx`, `app/globals.css`
- **[S] H. 정직성 핫픽스(P2 전, W0 핫픽스 뒤 — 디자인 브랜치와 별개로 main에서 진행, 이 스펙은 기록만 한다)**
  - 타이포 쪽 항목: Manifesto '안 됩니다', ProblemCost '수밖에' 교정. 문서에서 Hero 'AI 생성 이미지' 라벨 지시 삭제(이 문서의 T5 지시는 2026-10-28 개정에서 지웠다).
  - 게이트는 소스 정규식이 아니라 하이드레이션 뒤 렌더 텍스트를 브라우저 도구로 검사한다('3x'는 `text-3xl`에 걸리고, 카운트업은 SSR에서 0이며, '-67%'는 ASCII다).
- **[S] T4. P2 프리미티브·셸(고급화 2026-10-28 반영)**
  - **첫 커밋**: globals.css h1–h4 모바일 `letter-spacing: 0 !important`를 어드민 전용 셀렉터로 이관(RA-1, 어드민 diff 0). 이것이 없으면 아래 자간 표가 모바일에서 효과가 없다.
  - 토큰 PR(tokens.css·site-base.css): 데스크톱·모바일 자간 표(§2-3), 굵기 V13-A(display·h1·h2 600), `text-h1` 36→56, 시뮬레이터 결과 금액 `text-h2`, selection(CO-3).
  - Pretendard 자체 호스팅(T1, C04) 뒤 실제 전송 woff2에서 `ss05`·`cv12`·`ss03`을 확인하고, 보드에서 이득이 보일 때만 켠다. `font-feature-settings` 목록은 변수 하나에서만 관리한다(TY-7).
  - `components/ui/typography.tsx`(Kicker V12-A 바 없음, ChapterHead TY-1, Numeral 비례 숫자·각주 prop — `lib/facts.ts`는 system §7), `components/ui/PullQuote.tsx`(여는 따옴표 −0.45em 매달기, attribution 14/500).
  - 0바이트 조판 마감(TY-7·RA-6): 한글 사이 가운뎃점 공백 0, 14px 이하 600 제한(래칫).
  - 가드: P2 신설 가드 5개 중 타이포 몫 4개 `heading-accent`·`text-center-heading`·`small-semibold`·`hype-words`(§4-3, 모두 warn 래칫 신설. `radius-allowlist`는 system 소유).
  - 헤더·내비 `text-ui` 500, 푸터 `link-quiet`·법정 표기 `text-note`(controls와 같은 PR).
  - 수용: 375·390·1440 computed letter-spacing·font-weight가 토큰 값과 일치(모바일 자간 0 아님), 폰트 woff2 요청 목록 변화 없음(세리프 0), `/admin`·`/checkout` 스크린샷 차이 0. 600 대 700 Hero·Manifesto 보드는 iPhone 실기기와 Windows 1366×768 DPR1에서 본다.
- **[M] T5. P3 홈 Act 이관(V10-A 11지면 목차, 서사 모먼트 1개 = 커밋 1개, 시안 승인 후)**
  - Hero(V11-A·V9-A·V17-A): §3-2 표. 무도판 비대칭 표지, `ink-underline` 1구절(모먼트 ①), 진입 애니메이션 0, 워터마크 삭제. 출처를 확인한 EDB 판서 캡처가 커밋되면 V3-A 7/5로 바꾼다. 캡처가 커밋되기 전까지 Hero 안 `[data-figure]`·`[data-frame]` = 0이다. 출처 미확인 도판에는 어떤 라벨도 짐작해 달지 않는다(이전 판의 'AI 생성 이미지' 라벨 지시는 삭제).
  - 목차: Hero · LogoBar 띠 · 01 선언 · 02 공감(ProblemCost 정성 장부, '수밖에') · 부록 진단표 · Manifesto(`text-poster`, `ink-underline-scrub`, '안 됩니다', 모먼트 ②) · 03 흐름(OS 지도) · 04 화면 · 05 기록(CaseStudies·TestimonialWall·GlobalScale·Outcomes 합침: 사례 3 + 인용 4 + EEO 각주 수치 한 줄) · 06 확신(Comparison 비교표) · FinalCTA. Act Kicker 6개를 ChapterHead로, `text-h2`. 빠지는 섹션: EraVision, KeyUseCases(→SW), DashboardPreview, ScienceBased(→각주 단 블로그 글), SatisfyingClass.
  - 제목 속 그린 구절은 라우트 PR마다 뺀다(CO-4). 공개 h1/h2 가운데 정렬 0(TY-1).
  - FinalCTA h2 `text-h1`(왼쪽 정렬), PageHeader `text-h1`.
  - 나머지 eyebrow 삭제(LeadMagnet, GlobalScale, LogoBar, FAQ, Outcomes, TestimonialWall 등). 인용은 PullQuote 1이 기본이고 05 기록만 인용 4개 2단(§3-6). 인라인 letterSpacing·900/800·uppercase 넓은 자간 제거.
  - 공개 카피 맞춤법·교열 기준(§3-4) 1회 확인.
  - 파일: `app/page.tsx`(목차), `components/sections/{Hero,HomeEntitySummary,EraVision,ProblemCost,Manifesto,SolutionOverview,DashboardPreview,Comparison,FinalCTA,HomeLeadMagnet,GlobalScale,LogoBar,FAQ,Outcomes,TestimonialWall,CaseStudies,ScienceBased,KeyUseCases,SatisfyingClass}.tsx`(빠지는 섹션은 목차에서 뺀다), `components/ui/PageHeader.tsx`
- **[L] T6. P4 제품·하위 페이지 + 레거시 자간 정리**
  - SW 장 머리 Kicker, TypographyHook 바 → `ink-underline` 1개. ai-report Eyebrow pill → 장 머리 Kicker. HW eyebrow 13곳 → 장 머리 Kicker 또는 삭제, font-mono 수치 → tabular-nums. pricing `text-h1`, contact serif 제거, about 연도 `text-folio`.
  - docs 13·SegmentLandingPage 6의 `.tracking-*` → `text-h*`. 그 뒤 grep 0건을 다시 확인하고 globals.css 502–515를 별도 커밋으로 삭제한다(css_architecture).
  - 파일: `app/product/sw/page.tsx`, `app/product/ai-report/page.tsx`, `app/product/hw/page.tsx`, `components/product/hw/*.tsx`, `app/pricing/page.tsx`, `app/contact/page.tsx`, `app/about/AboutPageClient.tsx`, `components/docs/*.tsx`, `components/landing/SegmentLandingPage.tsx`, `app/globals.css`
- **[S] T7. P5 기사 본문(블로그 세션 커밋 후)**
  - 렌더러: 컨테이너 `text-article`, 블록 `max-w-measure`, `text-h2`/`text-h3`, blockquote `text-body-l` 500, 앵커·mark 클래스 삭제(base 규칙), 캡션 `text-note text-fg-muted`. 문서 본문 850px → 38em. `.blog-markdown` 모바일 !important 블록 삭제. Safari 26 레이아웃 시간 비교.
  - 장문 사다리(TY-9, §3-4): 레일 목차, standfirst, 바이라인, measure 646px, 그린 굵은 요약 → mark. 읽기 괘선(cards_motion)과 같은 단계다.
  - 파일: `lib/blog-markdown.ts`, `app/blog/[slug]/page.tsx`, `components/docs/DocsArticle.tsx`, `app/globals.css`
- **[L] T8. 읽기 하한·굵기·자간·크기 청소(라우트 PR마다, P3–P5에 걸쳐)**
  - 10·11·12px(370)과 읽는 `text-xs`(133) → `text-note`·`text-label`·`text-caption`. 13→note/label/folio, 14→caption, 15→ui(컨트롤만)·body, 16→body.
  - #A39E98 읽는 글자(193)·밝은 지면 알파(47)·먹 위 알파(46) → `text-fg-muted`(hex→토큰만, 다크 구간 surface-ink 이관 뒤).
  - font-black(40)·extrabold(22) → 토큰 굵기(제목 600, poster 700, 본문 strong 700. V13-A), light(3) → 400. 14px 이하 600 → 500(라벨·폼 라벨·버튼·'예시' 제외, RA-6). `tracking-[..]`(239)·`tracking-wide*`(71)·한글 uppercase(176) 삭제 또는 토큰. break-keep(88) 삭제(화면 변화 0). label leading-none → 토큰 행간, 플레이스홀더 토큰화.
  - 가드 베이스라인을 PR마다 낮춘다. 끝나면 공개 래칫 0.
- **[M] T9. 수동 줄바꿈 정리**: 헤딩 `<br>`(78) → 어구 inline-block + balance. QA 320/390/1440, Aa 125/150/200%, Chrome 200%, iOS 17.4.
- **[S] T10. OG 폰트(독립 PR)**: `assets/fonts/pretendard-static/`(아직 없는 경로, 이 PR에서 신설), `lib/og/template.tsx`, 두 OG 경로 fonts 옵션 400·700, 'C' 배지 → 텍스트 워드마크, 인라인 자간 삭제. 전후 OG 1장씩 렌더, 루트 OG 정적(○), 프리뷰 배포에서 블로그 OG 한글 700 확인.
  - 파일: `assets/fonts/pretendard-static/{Pretendard-Regular.otf,Pretendard-Bold.otf,OFL.txt}`, `lib/og/template.tsx`, `app/opengraph-image.tsx`, `app/api/og/blog/[slug]/route.tsx`, (필요 시) `next.config.ts`
  - P5(SY-4): 공유 카드 지면·제목·Kicker 라벨 재구성은 이 템플릿 위에서 한다(§2-1 OG).
- **[M] T11. 정적 랜딩 폰트 통일(growth-crm, 랜딩당 커밋 1개)**: 생성기 수정 + 재생성 4종, omo1·meets-july 손글 수정, 4주 리드 기준선, 6종 확인 뒤 CSP googleapis·gstatic 삭제.
  - 파일: `scripts/generate-segment-landings.mjs`, `public/l/{enterprise,managed,online,kids,omo1,meets-july}/index.html`, `next.config.ts`
- **[S] T12. 문서 동기화**: DESIGN.md §3·§6·§7(§9 반영안, V12·V13·V18 결과 포함), 감사 문서 §5-4(Hero 밑줄 scaleX → 색 페이드, Manifesto 스크럽 = 색), §5-6 '타이포 리듬'(Display Hero 전용·Poster Manifesto, eyebrow → Kicker Act 전용, pill → V9), 방향 문서 'Case 카드 Kicker' → `text-label` 메타.
  - 파일: `DESIGN.md`, `docs/active/public-site-audit-motion-plan-2026-10-26.md`
- **[S] T13. 조건부**
  - (a) V18 재판정(P5, 인용 4개·Manifesto 문구 동결 뒤)에서 B가 이길 때만: Manifesto·인용 2역할에 명조를 연다. 슬라이스·전송량을 실측하고, 조건에 어긋나거나 '공문 같다'는 인상이면 A로 둔다.
  - (b) Windows 첫 방문 폰트 교체 shift > 0.02: 맑은 고딕 실측 → §2-5 ⑤.
  - (c) 필름스트립에 H1 음절 혼재: 한글 후보 조각 preload 최대 3개(LCP 악화 0 조건).
  - (d) 복사한 폰트 CSS 수정 필요: `pretendard-1.3.9-r2/` 리비전.

---

## 8. 수용 기준

- **네트워크**: /, /product/hw, /blog, /pricing에서 cdn.jsdelivr.net·fonts.googleapis.com·fonts.gstatic.com 요청 0건, 운영 HTML에 `orioncactus` 0회. T1 뒤 meets-july·classin-609-update·classin-calculator에서 jsdelivr 0건이고 Rendered Fonts가 'Pretendard Variable'. T1 뒤 운영 CSP 헤더 문자열에 `cdn.jsdelivr.net` 0회. T11 뒤 `public/l/**` 6종에서 세 도메인 0건.
- **캐시·preload**: `curl -sI https://classin.co.kr/fonts/pretendard-1.3.9/pretendardvariable-dynamic-subset.min.css`에 `cache-control: public, max-age=31536000, immutable`. font preload는 라틴 1개(+ 근거 있는 한글 최대 3개). preload 파일의 unicode-range에 U+0020-007E가 있다.
- **바이트**: 첫 방문 woff2 / ≤ 420KB, /product/hw ≤ 525KB, /blog ≤ 555KB, /pricing ≤ 270KB. 재방문 폰트 요청 0.
- **LCP·CLS**: iPhone 실기기 4G 3회 중앙값 LCP가 T0 기준선보다 나쁘지 않다. CLS ≤ 0.05, 그중 폰트 교체 shift ≤ 0.02. Windows Chrome 첫 방문 CLS ≤ 0.05. 필름스트립의 H1 서체 교체 시점이 기준선보다 늦지 않다.
- **토큰 computed(고급화 2026-10-28)**: 375·390에서 `.text-poster/.text-display/.text-h1/.text-h2/.text-h3/.text-numeral`의 letter-spacing이 0이 아니고 모바일 표 값(−0.025/−0.022/−0.018/−0.014/−0.006/−0.015em)에 해당하는 px다(390에서 display −0.89px, poster −1.2px [계산]). 레거시 h1–h4 `!important` 이관 뒤에 잰다. 1440×900에서 `.text-display` 72px·600·−2.52px, `.text-poster` 104px·700·−3.64px, `.text-h1` 56px·600·−1.68px, `.text-h2` 40px·600·−1px, `.text-body` line-height 28px, FinalCTA h2 font-size 56px. `.text-h1`은 390에서 36px대다.
- **제목 줄 수(TY-6)**: /pricing·/contact·/about H1은 1440에서 2줄 이하, 390에서 3줄 이하. 시뮬레이터 결과 금액(`text-h2`)은 1024에서 줄바꿈되지 않는다.
- **Hero(V11-A)**: 출처를 확인한 캡처가 커밋되기 전까지 Hero 안 `[data-figure]`·`[data-frame]` = 0, Lighthouse LCP 요소 = H1, Hero에 진입 애니메이션 0(V17-A).
- **P0 diff 0**: T2 전후 공개 7화면·/admin 2화면 스크린샷 차이 0. `/docs`·SegmentLandingPage의 `.tracking-*` 요소와 토큰 없는 헤딩의 computed letter-spacing이 T3 전후 같다.
- **사용처 가드**: `text-display`는 Hero.tsx, `text-poster`는 Manifesto.tsx, `folio={null}`은 Hero.tsx 밖에서 0건. `--budget`: 라우트당 `.ink-underline` ≤ 1, `.ink-underline-scrub` 사이트 1(홈), 홈 Kicker 7.
- **그린·정렬(고급화 2026-10-28)**: `heading-accent` 가드 기준 h1–h3·display·poster 안 `text-fg-accent` 0(warn 래칫, 베이스라인에서 감소만). 홈 `[data-kicker]` 안 `bg-fg-accent` 0, Kicker 라벨 computed color가 paper 위 #111110·먹 위 #FAFAF8. 공개 section h1/h2 computed text-align = start(StateBlock·Dialog 제외). 1440에서 Act·장 H2 왼쪽 끝이 본문 칸(4칸) 시작에 맞는다.
- **잉크 밑줄**: 320px, 390px + Aa 125%, Chrome 200% at 1440 스크린샷에서 어구가 줄바꿈되면 밑줄이 줄마다 붙고, 한 줄에만 그려지는 경우가 0. computed `text-decoration-thickness` 2px, `white-space`는 normal, `::after` 밑줄 0. no-preference에서 Hero 루트 `getAnimations()`에 `ink-fade` 1개(duration `--motion-slow` 900ms · delay `--motion-beat` 240ms, V17-A), reduced·JS 끔에서 밑줄 색이 완성 상태. iPhone Safari 실기기 확인 기록(실패 시 정적).
- **입력**: 390px에서 공개 화면과 DemoModal·NewsletterModal·EventSignupModal·PublicLoginDialog·CheckoutRequestForm을 연 상태의 모든 input·select·textarea computed font-size ≥ 16px. iPhone Safari에서 이 다섯 폼에 포커스해도 확대되지 않는다. 어드민 다이얼로그 입력은 14px 그대로.
- **숫자 정직성**: 운영 화면에 출처 없는 Numeral과 카운트업 0. ProblemCost 장부에 숫자 열·합계 이중선·카운터 0, 6행. `example` Numeral은 mock Frame 안에만 있고 '예시'가 수치 옆 14px/600. Numeral 값의 computed font-variant-numeric에 `tabular-nums`가 없다(비례 숫자). `tests/lib/facts.test.ts` 통과.
- **표기**: 공개 카피 `안됩니다|수 밖에` 0건(H 게이트는 하이드레이션 뒤 렌더 텍스트로 확인). 한글 사이 ` · ` 0건(인용 데이터 제외). 홈의 번호 체계는 Act 폴리오와 05 기록 각주 번호 2종뿐, '그림 n' 0.
- **굵기**: 공개 파일에서 14px 이하 `font-semibold`(라벨·폼 라벨·버튼·'예시' 밖)의 새 위반 0(`small-semibold` warn 래칫).
- **기사**: 1440px에서 블로그·문서 본문 p의 computed max-width ≤ 646px, 이미지·표는 기사 열 폭(720px) 유지. 본문 em은 font-style normal·font-weight 600, mark는 background transparent·text-decoration-thickness 2px. P5(TY-9): 기사 H1 56px/600, 바이라인 날짜 = `lib/format.ts` 메타 표기, 그린 굵은 요약문 클래스 0.
- **tw-merge**: `tests/lib/cn.test.ts`의 5개 단정과 `text` 배열 = tokens.css `--text-*` 이름 집합.
- **대비**: axe-core color-contrast가 /, /product/hw, /product/sw, /product/ai-report, /blog, /pricing, /contact, /events, /updates에서 0건. 공개 범위 `text-[#1a1a1a]/xx`·`text-white/20~40`·읽는 `#A39E98` grep 0(T8 종료 시).
- **래칫**: `npm run check:design-tokens`가 통과하고 파일별 공개 위반 건수가 이전 커밋보다 늘지 않는다. 이관 종료 시 타이포 규칙 베이스라인 0.
- **글자 모션 0**: 공개 CSS에 font-size·letter-spacing·font-weight·font-variation-settings를 바꾸는 animation·transition 선언이 0.
- **확대 4상태**: system §9 4상태에서 헤딩·본문 잘림·겹침·가로 스크롤 0.
- **OG**: 적용 전후 OG 1장씩 렌더해 한글 700을 눈으로 확인. `next build` 출력에서 /opengraph-image·/twitter-image가 정적(○). 프리뷰 배포의 블로그 OG도 Pretendard로 그려진다.
- **QA 환경**: 폰트 판정을 Pretendard 미설치 기기에서 했다. 매트릭스에 iOS 17.4와 DPR1 1366×768이 있다. 보드·게이트를 iPhone 실기기와 Windows Chrome 1366×768 DPR1 두 환경에서 봤다(SY-1).
- **PullQuote**: 1440·390에서 여는 따옴표 글리프의 왼쪽 끝이 측정폭 왼쪽 끝보다 왼쪽에 있다(TY-7).
- **(V18 재판정에서 명조가 열릴 때만)** 해당 figure의 computed font-family 첫 항목이 명조, 인용·Manifesto가 있는 경로만 세리프 전송, 그 밖 경로 0B.
- **어드민 무변화**: /admin 대표 화면 1440px 스크린샷이 각 단계 전후 같다.
- **게이트**: `npm run typecheck`, `npx eslint app components lib --max-warnings=0`, `npm run build`(prebuild 가드 포함), `npx vitest run` 통과.

---

## 9. DESIGN.md 반영안

토큰 절은 T2(P0) PR에서, 컴포넌트·모션 문장은 해당 구현 PR과 같은 커밋에서 고친다. 고급화(V10–V18 A, 2026-10-28)로 바뀐 굵기·자간·h1·Kicker·숫자·그린 값은 P2 토큰 PR(T4)에서 함께 고친다. 상태 배지: `[in force]` 시행 중, `[target]` 목표(구현 PR 머지 시 in force), `[retired]` 폐기. 지금 DESIGN.md에는 '§3 굵기 4단'이 아직 없고 아래 반영안에만 있다.

━━━ 교체 1 — DESIGN.md 147–173행(§3 전체) ━━━

## 3. 타이포그래피 (편집 지면 · OS판)

> 적용 범위: **public(`.site`)** — AppChrome 공개 분기, 공개 DialogContent 5곳, 공개 토스트. **admin**은 이 절의 전역 규칙을 받지 않는다(폰트 패밀리만 공유). 정본 스펙: docs/active/public-site-design-language-2026-10-26/system.md(system), 타이포 스펙.

### 서체
- `[target]` **Pretendard Variable 하나만 쓴다**(OFL 1.1, wght 45–930 가변 1파일). 라틴은 Inter 기반이라 라틴 서체를 짝짓지 않는다. `[retired]` 이전 표기 `Inter, -apple-system, …`는 실제와 달랐다.
- `[target]` 로딩(V1-A): `public/fonts/pretendard-1.3.9/`에 dynamic-subset `.min.css`와 woff2 92조각 자체 호스팅, 1년 immutable, 라틴 조각 preload 1개. 제3자 폰트 요청 0. 복사한 CSS는 제자리 수정 금지(`-r2` 폴더로 리비전). `font-display: optional` 금지.
- 스택(`--font-sans`): `"Pretendard Variable", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Segoe UI", "Malgun Gothic", "Noto Sans KR", Roboto, sans-serif`. 설치형 이름 `Pretendard`는 넣지 않는다.
- 세리프: 없음(V2-A, V18-A로 유지). 인용도 Pretendard 500이다. 인용 4개와 Manifesto 문구가 확정된 뒤 같은 보드로 재판정하고(P5), B가 이기면 Manifesto·인용 2역할에만 연다.
- 모노: 웹폰트 없음. `code`·`kbd`·`pre`·`samp`와 결제 쿠폰 입력에만 시스템 `ui-monospace` 스택. 수치·연도·표에는 쓰지 않는다.
- 예외: Paperlogy는 견적서 문서면(`components/portal/quotes/**`) 전용, 신규 사용 금지. OG는 `assets/fonts/pretendard-static/` Regular·Bold OTF.
- 추가 금지: Inter, Geist, Instrument Serif, Fraunces, Gilroy, 손글씨, 모노 웹폰트.

### 굵기 4단 (V13-A · 2026-10-28)
| 굵기 | 쓰는 곳 |
|---|---|
| 400 | 본문, 덱, 캡션 |
| 500 | 내비·탭, 메타, 폴리오, 인용, 14px 이하 바이라인·출처 이름 |
| 600 | Display, H1, H2, H3, 카드 제목, 버튼, 라벨·폼 라벨, '예시', 수치, em |
| 700 | Poster(Manifesto 한 곳), strong, OG 이미지 제목(C28 예외) |

- 300·800·900은 금지한다. 제목은 크게 쓰되 가볍게(600) 쓰고, 위계는 크기(h1 56 대 h2 40)가 잡는다. 크게 소리 내는 곳은 Manifesto 하나다.
- 14px 이하에서 600은 라벨·폼 라벨·버튼·'예시' 태그에만 쓴다.
- 강조는 굵기를 더 올리지 않고 ① 굵기 대비 ② 2px 잉크 밑줄 중 하나만 쓴다. h1–h3·display·poster 안과 본문의 그린 구절은 0이다(`heading-accent` 가드, warn 래칫).

### 계층 `[target]`
토큰은 Tailwind `text-*`(정의: `app/styles/tokens.css` `@theme inline`)이며 크기·행간·자간·굵기를 함께 든다.

| 토큰 | 크기 (390 → 1440px) | 굵기 | 행간 | 자간(≥40rem / <40rem) | 용도 |
|---|---|---|---|---|---|
| `text-poster` | clamp(3rem, 1.5rem + 6vw, 6.5rem) · 48 → 104 | 700 | 1.05 | −0.035em / −0.025em | Manifesto 두 줄 전용 |
| `text-display` | clamp(2.5rem, 1.75rem + 3.2vw, 4.5rem) · 40 → 72 | 600 | 1.12 | −0.035em / −0.022em | Hero H1 전용 |
| `text-h1` | clamp(2.25rem, 1.75rem + 2.1vw, 3.5rem) · 36 → 56 | 600 | 1.2 | −0.03em / −0.018em | 하위 페이지 H1, FinalCTA h2 |
| `text-h2` | clamp(1.75rem, 1.45rem + 1.2vw, 2.5rem) · 28 → 40 | 600 | 1.25 | −0.025em / −0.014em | 섹션 제목, 시뮬레이터 결과 금액 |
| `text-h3` | clamp(1.25rem, 1.15rem + 0.4vw, 1.5rem) · 20 → 24 | 600 | 1.4 | −0.01em / −0.006em | 카드 제목, 소제목 |
| `text-body-l` | clamp(1.0625rem, 1rem + 0.25vw, 1.1875rem) · 17 → 19 | 400 | 1.75 | 0 | 덱, 인용 벽 |
| `text-body` | 1rem · 16 | 400 | 1.75 | 0 | 본문 |
| `text-article` | 1.0625rem · 17 | 400 | 1.75 | 0 | 블로그·문서 본문 |
| `text-ui` | 0.9375rem · 15 | 요소가 정함(500/600) | 1.4 | 0 | 컨트롤 전용: 버튼 md, 내비, 탭, 칩 |
| `text-caption` | 0.875rem · 14 | 400 | 1.6 | 0 | 보조 설명, 바이라인, 폼 도움말·라벨(600), '예시'(600), 출처 이름(500) |
| `text-note` | 0.8125rem · 13 | 400 | 1.5 | 0 | 출처 기준일, 각주, 도판 캡션, 차트 눈금 |
| `text-label` | 0.8125rem · 13 | 600 | 1.4 | +0.02em | Kicker, 상태·범주 라벨, 표 머리 |
| `text-folio` | 0.8125rem · 13 | 500 | 1.4 | 0 | 폴리오 01–06, No. 01(tabular) |
| `text-numeral` | clamp(2.5rem, 1.9rem + 2.4vw, 4rem) · 40 → 64 | 600 | 1.0 | −0.02em / −0.015em | 수치(비례 숫자) |
| `text-quote` | clamp(1.25rem, 1.1rem + 0.7vw, 1.625rem) · 20 → 26 | 500 | 1.6 | 0 | PullQuote |

- `[retired]` 이전 표(Display Hero 64px −2.125px 등 px 자간, Badge 12px).
- Tailwind 기본 크기(`text-xs~9xl`)와 임의 크기(`text-[Npx]`)는 신규 사용 금지, 기존 사용은 가드 래칫으로 줄인다.
- 토큰을 `cn()`에 넣으려면 `lib/utils.ts`의 tailwind-merge 확장이 필요하다(설정은 그 파일 한 곳).

### 자간
- 간접 변수 `--trk-*`로만 준다. `(width < 40rem)`에서 헤딩·수치 자간이 `:root` 재정의로 줄인 음수가 된다(poster −0.025 · display −0.022 · h1 −0.018 · h2 −0.014 · h3 −0.006 · num −0.015em). 0으로 풀지 않는다.
- 인라인 `letterSpacing`, `tracking-[..]`, `!important` 자간 금지. 위 계층 표의 자간 값이 정본이고, 표 밖 값과 −0.035em보다 좁은 자간은 쓰지 않는다. 양수 자간은 Label +0.02em과 13px 이하 라벨 안 라틴 약어(AI·HW) +0.06em만. 한글 uppercase·넓은 자간 금지.
- 레거시 전역 h1–h4 모바일 `letter-spacing: 0 !important`는 P2 첫 커밋에서 어드민 전용 셀렉터로 옮긴다(어드민 변화 0).
- `text-label`·Kicker를 `<h3>`·`<h4>`에 붙이지 않는다(레거시 모바일 `!important`가 자간을 지운다).

### 행간·측정폭
- 행간은 토큰이 든다. 전역 `p { line-height }`는 만들지 않는다.
- 측정폭: 본문 `max-w-measure` 38em(17px = 646px, 혼합 약 52자) · 덱 34em · 헤딩 18em · Display 14em · 인용 24em.

### 한글 조판 (`:where(.site)`) `[target]`
- `word-break: keep-all` + `overflow-wrap: break-word` + `font-synthesis: none`. 한글 이탤릭 금지.
- 인라인 강조: `em` 정체 600, `mark` 600 + 2px 그린 밑줄(파스텔 배경 금지).
- `text-wrap`: 헤딩 `balance`. `pretty`는 `.text-article`·`.text-body-l`·`.text-quote`·`figcaption`에만.
- 줄바꿈: 수동 `<br>` 대신 어구를 `inline-block`으로 묶는다. `overflow-wrap: anywhere`는 넘침이 확인된 곳에만.
- 문장부호: 곡선 따옴표 “ ” ‘ ’, 한국어 범위 `~`, 숫자만 있는 라틴형 범위 en dash `–`, 구분 `·`(한글 낱말 나열은 앞뒤 공백 없이 '전·중·후'). PullQuote 여는 따옴표는 `text-indent: −0.45em`으로 매단다(모든 브라우저).
- `::selection`: 밝은 지면은 바탕 rgb(8 71 52 / .14), 글자 #111110(합성 #D7DFDA 위 13.9:1). 먹 위는 세이지 알파 + 글자 #FAFAF8(`.surface-ink ::selection` 재정의). 공개 CSS의 #D1FAE5는 0.
- OpenType: `ss05`·`cv12`·`ss03`은 자체 호스팅 뒤 실제 woff2에서 확인하고 보드에서 이득이 보일 때만 켠다. `font-feature-settings` 목록은 변수 하나에서만 관리한다.

### 숫자
- 표·가격 열·차트·폴리오·날짜는 `tabular-nums`. 단독 디스플레이 숫자(`text-numeral`)는 비례 숫자. `lining-nums`·`.num`은 쓰지 않는다. 견적·시리얼 번호는 `ss06`.
- 큰 숫자는 `<Numeral factId>`(출처·기준일은 `lib/facts.ts`)만. 예시 수치는 mock Frame 안 `<Numeral example>`로만 쓰고 수치 옆에 '예시'(14/600)를 단다.
- 카운트업 0. 근거 없는 수치는 싣지 않는다.

### 프리미티브 `[target]` (`components/ui/typography.tsx`, `components/ui/PullQuote.tsx`)
- **Kicker**(V12-A): Act·장 머리 전용. 1px 먹 masthead 아래 레일에 [폴리오 13/500 #615D59 tabular] → 12px → [라벨 13/600 #111110 +0.02em]. 바 없음, 섹션 머리 그린 0. 먹 위 색은 C01 토큰이 바꾼다. folio 필수, `null`은 Hero('수업 시스템 OS' 라벨만). 홈 7개(Hero + Act 01 선언 · 02 공감 · 03 흐름 · 04 화면 · 05 기록 · 06 확신). 그 밖 섹션은 eyebrow 없이 H2로 시작하고, 카드 메타는 `text-label text-fg-muted`·`text-folio`.
- **ChapterHead**(TY-1): masthead → 레일 Kicker(64rem 이상 1–3칸) + 본문 H2(4–12칸, 위 맞춤 ±4px) → 덱. 64rem 미만은 Kicker를 H2 위에 쌓는다. 공개 h1/h2 가운데 정렬 금지(StateBlock·Dialog 제외).
- **PullQuote**: `text-quote` 500, 여는 따옴표만 #084734이고 −0.45em 매달기. 이탤릭·박스·아이콘·별점·좌측 바 없음, 측정폭 24em. 바이라인 24×1px 선 + attribution(서술형 익명 또는 실명, 별표 마스킹 금지) 14/500 + context 14/400 #615D59, 줄였으면 '일부 발췌'.
- **Numeral**: 위 1px 선(strong) → 16px → `text-numeral`(비례 숫자) + 단위(0.5em 600) → 출처 이름 14/500 · 기준일 13 #615D59. 수치 3개 이상인 행은 각주 번호 + 13px 각주.

### 2px 그린 선 의미 사전
| 선 | 뜻 |
|---|---|
| 잉크 밑줄 | 페이지의 한 구절(페이지당 1 + Manifesto 1) |
| mark 밑줄 | 기사 저자의 강조 |
| index-tab 막대 | 현재 위치(탭·내비) |
| 좌측 2px 바 | Comparison Classin 열, /pricing 가이드 선택 행, 세로 목차 현재 항목 |

- 한 선이 두 뜻을 겸하지 않는다. 잉크 밑줄은 모든 폭에서 `text-decoration`(줄마다 붙음)이고 등장은 `--motion-beat` 뒤 `--motion-slow` 색 페이드 1회다(V17-A, cards_motion §3-14). `[retired]` Kicker 바(V12-A), ::after scaleX 긋기, 자동 진행 괘선, 토스트 상태선.

### 링크
- 본문: `link-body` — #084734, 평상시 밑줄 1px(offset 0.22em, `--line-link` 그린 .6 = 3.43:1 paper #F9F8F5). hover·focus-visible에서 #073D2D(짙어짐) + 불투명 밑줄. 본문 글자와 색 대비가 1.23:1뿐이라 밑줄을 뺄 수 없다.
- 내비·푸터: `link-quiet` — 평상시 밑줄 없음, hover·focus-visible에서 나타남. 카드 제목은 밑줄·색 변화 없음.
- 먹 지면(#1A1917): 세이지 #8FC4AC(8.92:1), 밑줄 rgb(143 196 172 / .6).

### 하한
- 읽는 글자 13px 이상, 입력 16px 이상(공개 모달 포함, 보증 규칙). 수치 옆 '예시'·Numeral 출처 이름 14px.
- 보조 글자 #615D59 이상, #A39E98은 장식 전용. **밝은 지면 알파 글자 금지**. 먹 위 읽는 글자 최저는 `--fg-muted`(/.56).
- 크기 토큰은 rem. 폰트 QA는 Pretendard 미설치 기기(iPhone 실기기)에서 한다.

━━━ 교체 2 — DESIGN.md 254–257행(§6 첫 네 줄) ━━━
- 기본 텍스트(`#111110`) on `#F9F8F5`: 17.79:1 (AAA). 본문(`#31302E`) on `#F9F8F5`: 12.41:1 (지면 값은 V15-A)
- 보조 텍스트(`#615D59`) on white / `#F9F8F5` / `#F3F2EE`: 6.53 / 6.14 / 5.82:1 (AA). `#A39E98`(2.50:1 paper)은 읽는 글자에 쓰지 않는다
- Green(`#084734`) on white / paper: 10.71 / 10.08:1 (AAA). 먹 면(`#1A1917`) 위에서는 1.64:1이라 글자·포커스에 쓰지 않고 세이지 `#8FC4AC`(8.92:1)를 쓴다
- 밝은 지면의 알파 글자는 금지한다. 먹 위 글자는 `--fg-*` 토큰만 쓴다(본문 /.72 = 9.14:1, 최저 /.56 = 6.00:1)
- 본문 링크는 평상시 밑줄 필수(링크와 본문 글자 색 대비 1.23:1). 밑줄 색은 `--line-link`(3:1 이상)
- 읽는 글자 13px 이상, 입력 16px 이상(공개 모달 포함). 글자 크기 토큰은 rem
- 판정: axe-core color-contrast 0건 + 알파·faint 글자 가드 0건. 사진·도판 위 글자는 프레임 실측표
- 모든 인터랙티브 요소: `2px solid` 포커스 링

━━━ 교체 3 — DESIGN.md §7 3번 교체, 8번 뒤 추가 ━━━
3. 글자 크기·행간·자간은 토큰만 쓴다(`text-poster/display/h1/h2/h3/body-l/body/article/ui/caption/note/label/folio/numeral/quote`). `text-display`는 Hero, `text-poster`는 Manifesto 전용. 금지: 인라인 `letterSpacing`, `tracking-[..]`, `text-xs~9xl`, `text-[Npx]`, `font-black/extrabold/light`, 한글 `uppercase`, `text-(--fg-*)` 임의값. 색은 `text-fg-*`.
(8번 다음에 추가)
9. 공개 화면 서체는 Pretendard Variable 하나(자체 호스팅)다. 세리프·모노 웹폰트 없음. 숫자는 표·가격·폴리오·날짜 `tabular-nums`, 단독 큰 숫자는 비례 숫자. 제목은 600, 700은 Manifesto poster·본문 strong·OG 이미지 제목(C28 예외)만. 제목·본문 안 그린 구절 금지. Act 머리는 `<Kicker folio>`(바 없음)와 ChapterHead, 인용은 `<PullQuote>`, 큰 숫자는 `<Numeral factId>`만. 카운트업 금지. 공개 h1/h2 가운데 정렬 금지.
10. 공개 포털 UI(Radix Content)에는 `site` 클래스를 단다. 빠지면 입력 16px 보증과 조판 규칙이 빠진다.

━━━ 추가 — 결정 로그 절(system §10이 신설, 타이포 행) ━━━
| V | 선택 | 날짜 | 근거 | 보드 |
|---|---|---|---|---|
| V1 | A 자체 호스팅(확정) | 2026-10-27 | 기기 간 동일성, 제3자 왕복 0. 되돌림 조건: T1 뒤 iPhone 4G LCP·폰트 바이트가 기준선보다 나쁘면 B | Type.dc.html |
| V2 | A 세리프 없음(V18-A로 유지, 재판정은 P5) | 2026-10-27 | 0바이트. 명조 재판정은 V18 행 | Type.dc.html |
| V12 | A 바 없음, 먹 라벨(Kicker = 폴리오 → 12px → 먹 라벨) | 2026-10-28 | 짧은 대시와 색 라벨은 템플릿 eyebrow. 그린은 링크·버튼·현재 위치에만. V9 핵심(pill → Kicker)은 유지 | 고급화 V10–V18 · V12·V13 |
| V13 | A 제목 600, Manifesto(poster)만 700, h1 56px, 숫자 600 비례, 14px 이하 600 제한 | 2026-10-28 | 모든 제목이 700이면 한글 마케팅 제목이 외치는 인상. 크게 쓰되 가볍게, 소리는 Manifesto 하나 | 고급화 V10–V18 · V12·V13 |
| V18 | A 지금은 Pretendard 하나(V2-A 유지) | 2026-10-28 | 바이트가 아니라 시점 문제. 인용 4개·Manifesto 문구 확정 뒤 같은 보드로 재판정(P5) | 고급화 V10–V18 · V18 |

---

## 10. 하지 말 것

- 인라인 `letterSpacing`, `tracking-[..]`, `tracking-wide*`, 한글 `uppercase`, `!important` 자간
- 모바일 헤딩·수치 자간을 0으로 되돌리기, 자간 표(§2-2) 밖 값, −0.035em보다 좁은 자간
- Manifesto poster 밖 700 제목(OG 이미지 제목 C28 예외), 14px 이하 600(라벨·폼 라벨·버튼·'예시' 밖)
- h1–h3·display·poster 안 그린 구절(두 색 제목), 본문 그린 구절, 그린 굵은 요약문
- 공개 섹션 h1/h2 가운데 정렬(StateBlock·Dialog 제외)
- Kicker에 그린 바·그린 라벨, 카드 범주·지역 라벨에 `text-fg-accent`
- 단독 디스플레이 숫자에 `tabular-nums`, 한글 낱말 사이 ` · `(공백 있는 가운뎃점)
- 출처를 확인하지 못한 Hero 도판에 짐작한 정직 라벨('AI 생성 이미지' 등) 달기
- 공개 카피의 과장어(압도적·차원이 다른·최적화된·검증된·혁신·완벽·100%)
- Tailwind 기본 크기 `text-xs~9xl`, 임의 크기 `text-[Npx]`(래칫으로 감소만 허용)
- `text-(--fg-*)` 임의값 색 문법, var() 폴백값
- `text-display`를 Hero 밖에서, `text-poster`를 Manifesto 밖에서, `folio={null}`을 Hero 밖에서
- 카드·본문 문장에 `text-ui`(15px)
- `font-black·extrabold·light`(300/800/900)
- 가변 wght·자간·크기 애니메이션, 글자·단어 쪼개기 애니메이션
- 그라데이션 텍스트, drop-shadow 글자, 글래스 배지 위 글자
- 이탤릭. 세리프(V18 재판정 전), Manifesto·인용 밖 세리프, 명조 제목 체계, Latin 디스플레이 서체, 코드 밖 모노, 새 웹폰트, Paperlogy 신규 사용
- 얇은 굵기(100–300)로 '럭셔리' 내기(40~50대 가독성, Windows DPR1에서 한글 획이 깨진다)
- 13px 미만 읽는 글자, 밝은 지면 알파 글자, `#A39E98` 읽는 글자, 먹 위 리터럴 알파 글자
- 수동 `<br>`로 줄 맞추기, 전역 `overflow-wrap:anywhere`, 전역 `p { line-height }`, 전역 p에 `text-wrap: pretty`
- `.site` 밖에 거는 공개 base 규칙, globals.css에 새 공개 규칙, tokens.css 밖의 토큰 선언
- `text-label`·Kicker를 `<h3>`·`<h4>`에
- `cn()` 확장 전에 토큰 쓰기, tw-merge 목록을 다른 파일에 따로 두기
- 출처 없는 큰 숫자, 출처 칸에 '예시', 카운트업, '○ 예시'
- 잉크 밑줄 페이지당 2개 이상(scrub 제외), `white-space: nowrap` 밑줄, ::after scaleX 밑줄
- Act 머리 아닌 곳의 Kicker, 대체 eyebrow 만들기, 영문 대문자 eyebrow, 가짜 잡지 메타데이터('Vol. 03', '2026 가을호'), 속 빈 거대 번호
- 폰트 스택에 설치형 이름(`Pretendard`), 운영자 맥에서 폰트 판정
- 자체 호스팅 폰트 CSS 제자리 수정, `/fonts/:path*` 전체 immutable, `font-display: optional`
- 정적 랜딩 HTML 생성물 직접 수정(생성기를 고친다)

---

## 11. 열린 질문

1. **V1 — A 확정(2026-10-27)**: 자체 호스팅으로 간다. 되돌림 조건: T1 배포 뒤 iPhone 4G LCP·폰트 바이트가 기준선보다 나쁘면 B(시스템 우선)로 바꾼다(파일 동일, 전환 비용 0).
2. **V2 시안 ① → V18-A(2026-10-28)로 지금은 열지 않습니다.** 인용 4개와 Manifesto 문구가 확정된 뒤(P5) 같은 보드로 재판정합니다. 그때 여는 따옴표 크기(본문 크기 대 2.4em)도 함께 볼까요? 그 전까지는 A + 본문 크기입니다.
3. **V3-B로 바뀔 경우**: 홈이 다크 영상 Hero로 가면 Hero 섹션에 `surface-ink`, 평면 스크림 1겹, 포스터 프레임과 가장 밝은 프레임 5장 대비 실측(Display ≥ 3:1, 덱·Kicker 라벨 ≥ 4.5:1, 밑줄·바 ≥ 3:1)이 필요합니다. 이 스펙은 V11-A(캡처 전 무도판 표지)와 V3-A(캡처 커밋 뒤) 기준으로만 썼습니다.
4. **Poster 크기**: Manifesto를 136px/900에서 104px/700으로 내립니다(700은 V13-A로 확정, 자간 −0.035em / 모바일 −0.025em). 시안에서 1440px 2줄, 390px 4줄 구성을 확인해 주세요.
5. **ProblemCost 수치 근거(감사 D3)**: 20%·1,200만원·3개월·85%의 출처를 확보할 담당이 있습니까? 확보되면 `lib/facts.ts`에 등록하고 장부 위에 Numeral 1개를 둡니다.
6. **Windows 폴백 측정 담당**: 맑은 고딕 한글 진행폭과 첫 방문 CLS는 Windows 기기에서만 잴 수 있습니다.
7. **레거시 전역 h1–h4 자간(globals.css 429–442, 모바일 `!important`) — 결정됨(고급화 2026-10-28, RA-1)**: P2 첫 커밋에서 규칙을 어드민 전용 셀렉터(`.site` 밖)로 옮깁니다. 공개 화면에서는 지워지고 어드민 diff는 0입니다. 모바일 자간 표가 효과를 내려면 이 이관이 먼저입니다. css_architecture의 '미사용' 표기는 고칩니다.
8. **기사 본문 폭 — 채택(TY-9, P5)**: 블로그 720px(약 59자)·문서 850px(약 69자)를 텍스트 646px(38em)로 줄입니다. 이미지·표는 720px 열을 유지합니다. 블로그 세션 커밋 뒤 적용합니다.
9. **connect-src의 jsdelivr**: C04에 따라 T1에서 style·font-src와 함께 지웁니다(남기는 예외 없음). 폰트와 무관해 보이지만, 아는 소비처가 있으면 알려 주세요. 그 소비처를 같은 PR에서 같은 출처로 옮깁니다.
10. **자간 상한과 중간 폭 — 닫힘(2026-10-28)**: 렌더 크기 기준 상한 단계를 없앴다. 자간 표(§2-2·§2-3)가 정본이고, 표 밖 값과 −0.035em보다 좁은 자간은 쓰지 않는다. 새 브레이크포인트는 만들지 않는다(X02).
