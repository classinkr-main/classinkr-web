# ClassIn 쇼케이스 한국판(/expo)

기준 시점: 2026-11-10
문서 목적: 박람회 키오스크·iPad용 정적 앱 `/expo`의 구조, 본사 갱신 재이식 절차, 한국판이 소유하는 파일, 진입·설치 방법, 사이트 공통 보안 헤더의 예외와 그 이유를 한곳에 둔다. 구현 사실은 실제 코드(`public/expo/`, `scripts/expo/import-hq.mjs`, `next.config.ts`)가 우선한다.

## 1. 무엇인가

- 본사(ClassIn HQ)가 싱가포르 EDUtech Asia 2026 박람회에서 쓴 쇼케이스 앱(classin-edutech.web.app)을 한국 박람회용으로 옮긴 사본이다. 주소는 `https://classin.co.kr/expo`.
- Next 페이지가 아니라 `public/expo/` 아래의 순수 정적 파일(약 490개, 약 100MB)이다. 빌드·서버 코드와 섞이지 않는다.
- 검색에 노출하지 않는다(`X-Robots-Tag: noindex, nofollow`). 사이트맵·내비게이션에도 넣지 않는다.

## 2. 구조

| 경로 | 역할 |
| --- | --- |
| `index.html` + `shell.js`·`shell.css` | 셸. 상단 탭이 같은 출처 iframe 4개를 띄운다. 언어 선택, 링크 공유, 전체 화면, 오프라인 저장 상태 버튼 |
| `ai/index.html` | AI 존(탭 `#ai`). 로봇 데모는 카메라 + MediaPipe 포즈 추적(WASM, 워커 `ai/robot/tracker-worker.js`) |
| `rooms/index.html` | 교실 공간(탭 `#rooms`). three.js·model-viewer + Draco 디코더(WASM, `rooms/draco/`) |
| `deck/room-designer.html` | 교실 설계(탭 `#designer`) |
| `deck/edutech.html` | 슬라이드(탭 `#slides`) |
| `made.js` | 에디션이 넣은 HTML 슬라이드를 `sandbox` srcdoc iframe 으로 띄우고, 영상 주소를 임베드 주소로 바꾼다 |
| `edition.js`, `editions/kr.json` | 에디션(나라별 문구·자체 슬라이드). 한국판은 본사 Firestore 대신 같은 출처 정적 JSON 을 읽는다 |
| `i18n.js`, `i18n/<앱>/ko.json` | 번역. 한국판은 한국어·영어만 둔다 |
| `sw.js`, `version.json` | 오프라인 저장. 서비스워커 범위는 `/expo/`, `version.json` 은 파일 목록과 해시 |
| `manifest.webmanifest` | 홈 화면 설치 정보(이름 "ClassIn 쇼케이스", `lang: ko`, 시작 `./index.html`, 가로 고정) |

셸과 탭 앱은 서로 상대 경로로 부른다. 그래서 진입 URL 은 반드시 파일 경로 `/expo/index.html` 이어야 하고, `/expo`·`/expo/` 는 `next.config.ts` 의 리다이렉트로 그리로 보낸다(쿼리 보존). `#ai`·`#rooms`·`#designer`·`#slides` 로 첫 탭을 고를 수 있다.

## 3. 한국판이 소유하는 파일

재이식 스크립트는 아래 파일이 이미 있으면 본사 것으로 덮지 않는다(`import-hq.mjs` 의 `KR_OWNED`).

- `public/expo/editions/kr.json` — 한국 에디션 문구·슬라이드
- `public/expo/i18n/*/ko.json` — 한국어 번역
- `public/expo/kr/**` — 한국판 전용 자산
- `public/expo/manifest.webmanifest` — 한국판 이름·언어·시작 경로

그 밖의 본사 HTML·JS 는 직접 고치지 않는다. 꼭 바꿔야 하면 `import-hq.mjs` 의 `PATCHES` 에 "정확히 한 번 맞는" 치환으로 넣는다 — 본사 코드가 바뀌어 패치가 안 맞으면 스크립트가 멈추고 알린다.

## 4. 재이식(본사 갱신 가져오기)

```bash
node scripts/expo/import-hq.mjs                 # 본사 사이트에서 내려받아 가져오기
node scripts/expo/import-hq.mjs --from <dir>    # 이미 내려받은 사본에서 가져오기
node scripts/expo/import-hq.mjs --manifest-only # 파일은 두고 version.json 만 다시 만들기
```

- 스크립트가 하는 일: 본사 `version.json` 목록 내려받기(본사 어드민·다른 나라 에디션·다른 언어 제외) → 루트 절대경로를 `/expo/…` 로 치환 → `PATCHES` 적용(기본 에디션 kr, 언어 ko·en, 에디션 정적 JSON 읽기) → `version.json` 재생성.
- 한국판 파일(§3)을 고친 뒤에도 `--manifest-only` 로 `version.json` 을 다시 만든다. 해시가 맞지 않으면 키오스크의 오프라인 저장이 그 파일을 다시 받지 않는다.
- 가져온 뒤 확인: 로컬에서 `npm run build` 후 `npx next start` 로 띄우고 `/expo` → 4개 탭을 열어 콘솔에 CSP 위반·404 가 없는지 본다. 본사 앱이 새 외부 출처를 쓰기 시작했는지도 본다(§6 의 CSP 에 없으면 막힌다).

## 5. 키오스크·iPad 설치

1. 진입 URL: `https://classin.co.kr/expo` (→ `/expo/index.html`). 설치 모드를 강제하려면 `/expo?install`.
2. iPad: Safari 로 열고 공유 → "홈 화면에 추가". 홈 화면 아이콘으로 열면 독립 실행(standalone)으로 뜬다.
3. 데스크톱·안드로이드 Chrome: 주소창의 설치 버튼(또는 메뉴 → 앱 설치).
4. 설치한 앱(또는 `?install`)으로 열면 상단 상태 버튼이 파일을 내려받기 시작하고, 끝나면 "Ready offline" 이 뜬다. 그 뒤로는 박람회장 Wi-Fi 가 끊겨도 동작한다. 저장 중 끊기면 상태 버튼을 눌러 다시 시도한다.
5. 로봇 데모는 첫 실행 때 카메라 권한을 묻는다. 허용해 둔다.

참고: 셸은 호스트가 `localhost` 일 때 공유 버튼과 오프라인 저장을 끈다(본사 개발용 동작). 로컬에서 오프라인 저장을 시험하려면 `127.0.0.1` 로 연다.

## 6. 보안 헤더 예외와 이유

`/expo/:path*` 는 `next.config.ts` 의 사이트 공통 헤더(`/(.*)`) 뒤에 오는 전용 규칙으로 같은 키를 덮는다. HSTS·`nosniff`·Referrer-Policy·COOP 등 나머지는 공통 값 그대로다. 회귀는 `tests/security/expo-headers.test.ts` 가 막는다.

| 헤더 | 사이트 공통 | `/expo` | 이유 |
| --- | --- | --- | --- |
| CSP `frame-ancestors` / `X-Frame-Options` | `'none'` / `DENY` | `'self'` / `SAMEORIGIN` | 셸이 같은 출처 iframe 4개를 띄운다. 다른 출처의 액자 넣기는 여전히 막는다 |
| CSP `script-src` | 분석·결제 출처 다수 | `'self' 'unsafe-inline' 'wasm-unsafe-eval'` | MediaPipe·Draco 가 WASM 이다. 인라인 스크립트는 본사 HTML 과 made.js srcdoc 슬라이드(부모 CSP 를 물려받음)가 쓴다. `'unsafe-eval'` 은 열지 않는다 |
| CSP `worker-src` | `'self' blob:` | `'self' blob:` | 로봇 추적 워커(같은 출처)와 Draco 디코더 blob 워커 |
| CSP `connect-src` | Supabase·분석 등 | `'self' blob:` | 모든 데이터(에디션·번역·모델·WASM)가 같은 출처다. `blob:` 은 three.js GLTFLoader 가 .glb 속 텍스처를 blob URL 로 읽어서다(없으면 3D 모델 텍스처가 빠진다). 본사 Firestore 는 패치로 쓰지 않으므로 열지 않는다 |
| CSP `frame-src` | 지도·결제·YouTube 등 | `'self' https://www.youtube-nocookie.com` | 에디션 슬라이드의 영상 레이아웃. Vimeo·Bilibili 변환은 본사 코드에 있지만 한국판에서 쓰지 않아 열지 않는다 |
| Permissions-Policy | 카메라·마이크·위치 차단 | `camera=(self)`, `fullscreen`·`autoplay`·`clipboard-write`·`web-share` = `(self)`, 마이크·위치 차단 | 로봇 데모의 카메라(영상만), 키오스크 전체 화면·영상, 셸의 링크 공유 |
| `X-Robots-Tag` | 없음 | `noindex, nofollow` | 키오스크용 사본이라 검색에 노출하지 않는다. robots.txt 로 막으면 이 헤더를 읽지 못하므로 막지 않는다 |
| `Cache-Control` | (경로별) | HTML·JS·CSS·JSON·webmanifest·WASM, `editions/`·`i18n/`, `/expo` 리다이렉트: `no-cache`. 그 밖의 미디어: `public, max-age=86400, stale-while-revalidate=604800` | 파일 이름에 해시가 없어 재이식·콘텐츠 수정이 같은 이름으로 바뀐다. 코드는 매번 재검증(304), 미디어는 하루만 둔다. 오프라인 저장은 `?__net=` + `no-store` 로 받아 이 값과 무관하다 |

- `proxy.ts` matcher 는 `/expo`·`/expo/…` 를 제외한다. 정적 파일에 세션 갱신·관리자 가드가 필요 없다.
- 본사 앱이 새 외부 출처를 쓰게 되면 위 CSP 에 용도 주석과 함께 그 출처만 더하고, 이 표와 테스트를 같이 고친다.
