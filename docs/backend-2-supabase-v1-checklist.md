# Backend 2 Supabase V1 체크리스트

기준 시점: 2026-03-20  
용도: `Classin Home`에서 관리자 전용 접근과 블로그 CMS V1을 Supabase 기준으로 구현할 때 바로 따라갈 체크리스트

## 1. 프로젝트 세팅

- [ ] Supabase 프로젝트 생성
- [ ] Auth Email Provider 활성화
- [ ] Redirect URL에 로컬/배포 주소 등록
- [ ] Custom SMTP 연결
- [ ] `NEXT_PUBLIC_SUPABASE_URL` 설정
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 설정
- [ ] `SUPABASE_SERVICE_ROLE_KEY` 설정
- [ ] `@supabase/supabase-js` 설치
- [ ] `@supabase/ssr` 설치

## 2. 인증 레이어

- [ ] `lib/supabase/browser.ts` 추가
- [ ] `lib/supabase/server.ts` 추가
- [ ] `lib/supabase/middleware.ts` 추가
- [ ] `/admin/login` 페이지 추가
- [ ] 로그인 처리에 `signInWithPassword()` 연결
- [ ] 로그아웃 처리에 `signOut()` 연결
- [ ] `/admin/**` 보호 로직 추가

## 3. 관리자 권한 모델

- [ ] `admin_profiles` 테이블 생성
- [ ] `role` enum 정의
- [ ] `status` enum 정의
- [ ] 최초 `SUPER_ADMIN` 1명 생성
- [ ] `getAdminProfile(userId)` 유틸 작성
- [ ] `requirePermission()` 가드 작성
- [ ] `SUSPENDED` 계정 차단 처리

## 4. 운영자 초대

- [ ] `/api/admin/users/invitations` 또는 Server Action 추가
- [ ] `inviteUserByEmail()` 연결
- [ ] 초대 시 `admin_profiles` 생성
- [ ] 초대한 사람을 `invited_by`에 기록
- [ ] 초대/권한 변경 시 `audit_logs`에 기록

## 5. 블로그 CMS

- [ ] `blog_posts` 테이블 생성
- [ ] 상태값 `DRAFT`, `IN_REVIEW`, `PUBLISHED`, `ARCHIVED` 정의
- [ ] `/admin/posts` 페이지 추가
- [ ] `/admin/posts/new` 페이지 추가
- [ ] `/admin/posts/[id]/edit` 페이지 추가
- [ ] 게시글 생성 API 또는 Server Action 추가
- [ ] 게시글 수정 API 또는 Server Action 추가
- [ ] 게시글 발행 API 또는 Server Action 추가
- [ ] `slug` 중복 검사 추가

## 6. 공개 블로그 연동

- [ ] `/blog` 데이터 소스를 DB 조회로 전환
- [ ] `PUBLISHED` 글만 노출
- [ ] `/blog/[slug]` 상세 페이지 추가
- [ ] 기존 하드코딩 블로그 데이터를 시드로 이관

## 7. 보안

- [ ] `service_role` 키를 서버에서만 사용
- [ ] `public` 테이블 RLS 정책 설계
- [ ] 또는 내부 전용 테이블은 `private` 스키마 사용
- [ ] 민감 작업에 서버 권한 검사 강제
- [ ] 로그인 실패/권한 변경/발행 작업 로그 기록

## 8. V1에서 미뤄도 되는 것

- [ ] MFA
- [ ] 소셜 로그인
- [ ] Realtime
- [ ] Edge Functions
- [ ] 리비전 비교 UI
- [ ] 예약 발행
- [ ] Storage 기반 이미지 업로드
- [ ] 세분화된 permissions 테이블

## 9. 완료 기준

- [ ] 초대받은 관리자만 `/admin` 접근 가능
- [ ] `EDITOR`는 글 작성/수정 가능하지만 발행 불가
- [ ] `ADMIN`은 발행 가능
- [ ] 공개 `/blog`는 발행된 글만 보임
- [ ] 커스텀 세션/패스워드 저장 없이 Supabase Auth만 사용
