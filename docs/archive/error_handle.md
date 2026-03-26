# Error Handle Notes

기준일: 2026-03-23

이 문서는 Classin Home 운영 중 실제로 발생한 장애, 원인, 재발 방지 포인트를 빠르게 파악하기 위한 유지보수 메모다.
특히 관리자 로그인과 배포 환경변수처럼 "로컬에서는 되는데 배포 후 깨지는" 유형을 우선 정리한다.

---

## 1. 관리자 로그인 배포 오류

### 증상

- 로컬에서는 `/admin/login` 에서 로그인 가능
- 배포 후에는 같은 비밀번호를 입력해도 "비밀번호 오류"가 발생
- 사용자는 단순 오입력인지 서버 설정 문제인지 구분하기 어려움

### 실제 원인

관리자 로그인은 코드에 하드코딩된 비밀번호를 쓰지 않는다.
서버에서 아래 환경변수를 기준으로 인증한다.

- `ADMIN_USERS`
- `ADMIN_PASSWORD`

우선순위는 다음과 같다.

1. `ADMIN_USERS` 가 있으면 그 값을 사용
2. 없으면 `ADMIN_PASSWORD` 사용
3. 둘 다 없으면 로그인 불가

즉, 로컬 `.env.local` 에 `ADMIN_PASSWORD` 가 있어도 Vercel Production 환경에 같은 값이 없으면 배포본 로그인은 실패한다.

### 이번에 반영한 대응

- 로그인 API가 실패 원인을 코드로 구분하도록 수정
- 로그인 화면에서 원인을 사람이 읽을 수 있는 메시지로 표시하도록 수정
- 잘못된 비밀번호와 환경변수 미설정/오설정을 구분하도록 개선

관련 파일:

- `lib/admin-auth.ts`
- `lib/admin-auth-errors.ts`
- `app/api/admin/auth/route.ts`
- `app/admin/login/page.tsx`
- `components/admin/AdminAuthGate.tsx`

---

## 2. 현재 운영 비밀번호 기준

2026-03-23 기준 로컬 개발 기본 비밀번호는 아래 값으로 변경했다.

```env
ADMIN_PASSWORD=classin2014
```

주의:

- 실제 배포 비밀번호는 Vercel에 저장된 값이 최종 기준이다
- `.env.local` 수정만으로는 운영 비밀번호가 바뀌지 않는다
- Vercel의 `ADMIN_USERS` 가 남아 있으면 `ADMIN_PASSWORD` 는 무시될 수 있다

운영을 단일 비밀번호로 유지할 때 권장 설정:

- `ADMIN_USERS` 삭제 또는 비움
- `ADMIN_PASSWORD=classin2014`

다중 계정이 필요할 때 예시:

```json
[{"name":"Admin","password":"classin2014","role":"admin"}]
```

---

## 3. Vercel 설정 체크리스트

### 관리자 로그인 관련 필수 설정

1. Vercel 프로젝트 선택
2. `Settings`
3. `Environment Variables`
4. 아래 둘 중 하나만 명확히 설정

- 단일 비밀번호 운영:
  - `ADMIN_PASSWORD=classin2014`
- 다중 사용자 운영:
  - `ADMIN_USERS=[{"name":"Admin","password":"classin2014","role":"admin"}]`

### 꼭 기억할 점

- `ADMIN_USERS` 가 있으면 `ADMIN_PASSWORD` 보다 우선한다
- 환경변수 변경은 이전 배포에 자동 반영되지 않는다
- 환경변수 저장 후 반드시 새 배포 또는 Redeploy 필요
- Preview 브랜치에도 관리자 로그인이 필요하면 `Preview` 환경에도 같은 변수 설정 필요
- 민감 정보이므로 `NEXT_PUBLIC_` 접두사 사용 금지

---

## 4. 재발 방지 포인트

### A. 로그인 실패 메시지는 반드시 원인 구분형으로 유지

운영자 입장에서 아래 3개는 전혀 다른 문제다.

- 비밀번호 오입력
- 배포 환경변수 누락
- `ADMIN_USERS` JSON 형식 오류

향후 로그인 로직 수정 시에도 이 세 가지를 하나의 "Unauthorized"로 뭉개지 않도록 유지한다.

### B. 운영 설정은 "로컬값"과 "배포값"을 항상 분리해서 본다

문제 재현 순서 권장:

1. `.env.local` 확인
2. 코드에서 `process.env` 참조 위치 확인
3. Vercel Environment Variables 확인
4. 마지막 배포 시점 확인
5. Redeploy 여부 확인

### C. `ADMIN_USERS` 사용 시 JSON 유효성 검증을 먼저 본다

예:

- 배열이 아님
- 빈 배열
- `name`, `password`, `role` 누락
- `role` 값이 `admin` 또는 `branch` 가 아님

이 경우 운영에서 로그인 전체가 막힐 수 있다.

### D. 비밀번호 변경은 기존 세션을 자동 만료시키지 않는다

현재 구조상 로그인 성공 시 `admin_session` 쿠키를 7일 보관한다.
따라서 비밀번호를 바꿔도 이미 로그인한 세션은 즉시 끊기지 않을 수 있다.

필요 시 향후 개선안:

- 세션 서명에 버전값 추가
- `ADMIN_SESSION_VERSION` 같은 환경변수로 강제 로그아웃 지원
- 단순 base64 쿠키 대신 서명 또는 서버 저장 세션으로 전환

---

## 5. 빠른 점검 명령어

로컬 확인:

```bash
npm run build
```

관리자 비밀번호 문자열 검색:

```bash
rg -n "ADMIN_PASSWORD|ADMIN_USERS|classin2014" -S .
```

운영 문제 재현 시 우선 확인할 파일:

- `lib/admin-auth.ts`
- `app/api/admin/auth/route.ts`
- `.env.local`

---

## 6. 이번 작업 결과

완료:

- 관리자 로그인 원인 구분 로직 추가
- 로그인 UI 오류 메시지 개선
- 로컬 기본 비밀번호 `classin2014` 로 변경
- 운영 설정 주의점 문서화

검증:

- `npm run build` 통과
- 변경 파일 대상 ESLint 통과

주의:

- 전체 `npm run lint` 는 저장소 내 생성 산출물까지 스캔하면 별도 잡음이 있을 수 있다
- 실제 운영 정상 여부는 Vercel 환경변수 설정 + Redeploy 까지 마쳐야 확인 가능

---

## 7. 다음 유지보수 시 권장 작업

- 관리자 인증을 단일 비밀번호 방식에서 계정 기반 인증으로 전환 검토
- 쿠키에 서명 또는 서버 세션 도입
- 운영 환경 체크리스트를 배포 문서와 연결
- 로그인 API에 감사 로그 추가
- 기존 로그인 세션 강제 만료 기능 추가
