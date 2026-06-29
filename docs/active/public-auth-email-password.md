# 공개 사용자 이메일/비밀번호 인증 (풀세트)

기존 OAuth(Google·Naver·Kakao) 전용 공개 로그인에 **이메일/비밀번호 인증**을 추가한 구성. 로그인·회원가입·비밀번호 재설정·이메일 확인까지 포함한다.

## 화면 / 라우트

| 경로 | 역할 | 비고 |
|------|------|------|
| `/login` | 로그인 (이메일·비번 폼 + SNS 아이콘 3종) | 이미 로그인 시 `next`로 redirect |
| `/signup` | 회원가입 (이메일·비번·이름·마케팅 동의) | 확인 메일 발송 후 안내 상태 |
| `/forgot-password` | 비밀번호 재설정 요청 | `resetPasswordForEmail` |
| `/auth/reset-password` | 새 비밀번호 입력 | recovery 세션에서 `updateUser` |
| `/auth/callback` | OAuth code 교환 | 기존 |
| `/auth/confirm` | 이메일 확인·recovery 링크 착지점 | `verifyOtp`(token_hash) 또는 `exchangeCodeForSession`(code) 모두 처리 |

## 흐름

- **로그인**: 클라이언트 `signInWithPassword` → 세션 쿠키 → 전체 이동(`next`).
- **회원가입**: `signUp({ emailRedirectTo: /auth/confirm?next=... })` → 확인 메일 → 링크 클릭 → `/auth/confirm`이 `verifyOtp`(type=signup) → 프로필 upsert + lead stitch → `next`.
- **비번 재설정**: `/forgot-password` → `resetPasswordForEmail({ redirectTo: /auth/confirm?next=/auth/reset-password })` → 메일 → `/auth/confirm`(type=recovery) → recovery 세션 → `/auth/reset-password`에서 `updateUser`.
- 프로필 upsert는 `getPublicUserContext()`가 매 서버 렌더에서도 수행하므로 비번 로그인 경로도 자동 반영된다.

## Supabase 대시보드 설정 (코드 외 필수)

코드로는 처리 불가 — 대시보드에서 직접 설정해야 메일 인증이 동작한다.

1. **Authentication → Providers → Email**: Enable. 운영에서는 "Confirm email" ON 권장.
2. **Authentication → URL Configuration**
   - Site URL: 운영 도메인.
   - Redirect URLs 허용목록에 추가: `/auth/callback`, `/auth/confirm`, `/auth/reset-password` (도메인별 정확 경로 또는 와일드카드).
3. **Email Templates** (크로스 디바이스 안전을 위해 token_hash 방식 권장):
   - Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/account`
   - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset-password`
   - 템플릿을 기본값(`{{ .ConfirmationURL }}`)으로 두면 PKCE `code` 방식으로 동작하며 `/auth/confirm`이 동일 브라우저 기준으로 처리한다.
4. **SMTP**: 운영 발송량을 위해 커스텀 SMTP 설정(기본 발송 한도 낮음).

## 소셜 프로바이더

- **Google**: 항상 노출(Supabase 네이티브, 기본 설정 가정).
- **네이버 / 카카오**: 커스텀 시작 라우트(`/api/auth/{naver,kakao}/start`). 각 env(`NAVER_CLIENT_ID`+`NAVER_CLIENT_SECRET`, `KAKAO_REST_API_KEY`) 설정 시 노출.
- **Apple**: Supabase 네이티브 프로바이더(앱 측 시크릿 불필요). 노출 조건:
  1. Supabase 대시보드 → Authentication → Providers → **Apple 활성화** (Apple Developer의 Services ID / Key / Team ID를 Supabase에 입력).
  2. 환경변수 **`APPLE_LOGIN_ENABLED=true`** (또는 `1`) 설정 → `/api/auth/providers`가 apple=true 반환 → 로그인/가입 화면 아이콘 노출.
- 페이스북/인스타그램은 의도적으로 제외(인스타는 일반 SSO 미지원/Basic Display 종료, 페북은 이메일 누락 리스크·운영부담으로 타깃 부적합).

## 알려진 제약 / 후속

- **계정 통합**: 같은 이메일이 Google OAuth와 이메일/비번로 각각 가입되면 서로 다른 auth user가 생긴다(Supabase 기본). lead 연결은 이메일 기준 stitch로 묶이지만 프로필은 분리될 수 있음 — 필요 시 identity linking 정책 별도 설계.
- 비밀번호 정책은 클라이언트 최소 8자 + Supabase 기본 정책. 강화하려면 대시보드 Password policy 조정.
- 비밀번호 재설정 페이지는 recovery 세션이 없으면 `updateUser`가 실패하며 사용자에게 재요청을 안내한다.
