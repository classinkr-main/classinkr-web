# Supabase 한국 리전 이관 결과

확인일: 2026-09-14. 홈페이지와 Compass의 운영 DB 및 Vercel 실행 리전을 서울로 전환했다. 기존 프로젝트는 보존한다.

## 운영 대상

| 구분 | 기존 프로젝트 | 현재 운영 프로젝트 |
| --- | --- | --- |
| Supabase ref | `kfoaodkgvhvmfrankeyu` | `pxbrsbovoobowpfarxmn` |
| 리전 | Singapore `ap-southeast-1` | Seoul `ap-northeast-2` |
| 관리 플랫폼 DB 버전 | `17.6.1.084` | `17.6.1.166` |
| 상태 | 정상, 이관 대상 테이블 쓰기 차단 | 정상, 운영 쓰기 허용 |

- Home 운영 배포: `dpl_CBVxhqKaCWHJqFMEdnPibofVMDMV`, Vercel `icn1`.
- Compass 운영 배포: `dpl_4yUadxRBeYUz7FZfjz991ieSPfjP`, Vercel `icn1`.
- Home은 확인된 기존 Production commit `fc341753e3911c5f8a883f5212609c8fe63c94c1`, Compass는 `6d568a3decbe67e56332fca6463bd1032589db60`으로 재빌드했다. 관련 없는 미배포 변경은 포함하지 않았다.
- Home의 모든 운영 도메인과 Compass의 두 운영 도메인은 위 배포에 연결했다. 두 Vercel 프로젝트의 기본 실행 리전도 `icn1`이다.

## 복제와 검증

15:25 KST부터 운영 요청을 잠시 중지하고 진행 중인 작업을 배출했다. 원본 쓰기 차단 후 최종 일관 스냅샷을 복원했고, 15:29 KST에 서비스와 기존 자동 동기화를 재개했다. 원본과 대상의 유효한 API 키, Management API 접근 및 DB 직접 연결을 확인했다.

| 범위 | 테이블 | 최종 복사 행 수 |
| --- | ---: | ---: |
| public | 156 | 112,172 |
| crm | 34 | 6,018 |
| edu12 | 15 | 50 |
| Auth 데이터 | 22 | 123 |
| 합계 | 227 | 118,363 |

- 227개 테이블의 컬럼 목록, 행 수, COPY 행 바이트의 SHA-256 누적 fingerprint가 모두 일치했다. 이 검증 이후 저장된 파일 URL 치환 및 운영 요청에 따른 정상 변경이 발생한다.
- Auth 사용자 15명과 identities 15개를 보존했다. 대상의 Supabase 관리 스키마와 자체 migration 이력은 유지했다.
- Storage 6개 버킷, 56개 파일, 28,758,599바이트를 복제했다. 전 파일 SHA-256, MIME, Cache-Control, 버킷 설정, 사용자 메타데이터 및 관련 시각을 대조했다. 원본 쓰기 차단 이후에도 누락·변경·해시 차이 0건이다.
- 유효한 저장 파일 URL 29개를 한국 프로젝트 URL로 치환했다. 원래부터 잘린 과거 URL 1종은 그대로 남겼다.
- RLS, 소유권, 함수, 뷰, 트리거, 인덱스, 제약, 기본 권한을 비교했다. 대상 기본 설정에서 추가된 권한 496개를 제거해 원본의 접근 경계를 보존했다. 최종 감사에서 예상하지 못한 차이 0건이다.
- 최신 overview 함수와 live-risk 비고유 인덱스를 적용했다. 기존 중복 리드를 삭제·병합하는 고유 인덱스 migration은 전화 19그룹·이메일 16그룹의 중복 데이터 때문에 적용하지 않았다.

## 설정 전환

- Home의 Supabase/POSTGRES 환경변수 23개 항목과 Compass `DATABASE_URL`을 교체했다. 각 항목의 기존 적용 환경과 보안 유형을 유지했다.
- 원본 Supabase → Home Vercel 자동 동기화 연결을 해제하고, 새 변수는 일반 프로젝트 환경변수로 관리한다. 대상 키를 회전할 때는 Vercel 값도 갱신하고 공개 키를 포함하는 앱을 재빌드해야 한다.
- Home의 `.env.local`, `.env`와 Compass의 `.env.development.local`을 한국 프로젝트로 바꿨다. 원본 값은 Git에서 제외된 비공개 이관 백업에 보관한다.
- Auth redirect/site URL과 메일 제목·본문 26개를 복제했다. 대상 메일은 기존 Resend 계정·검증된 발신 도메인을 사용하도록 구성했다. 테스트 메일은 발송하지 않았다.
- PostgREST, Storage, 네트워크, SSL, Edge Functions 설정을 확인했다. 앱 Edge Functions는 양쪽 모두 0개다. 대상 비밀번호 설정 이후 관리용 `SUPABASE_DB_URL` secret이 확인되며, 대상 프로비저닝에 따른 예상 항목으로 기록했다.
- Compass의 시간별 GitHub 동기화는 전환 중 중지하고 기존 활성 상태로 복구했다. 과거 알림이나 Cron 작업을 일괄 재실행하지 않았다.

## 운영 검증

- 실제 Home 도메인에서 `/`, `/contact`, 관리자 로그인, `/api/admin/leads`, `/api/admin/crm/overview` 모두 200. CSP는 한국 Supabase URL을 사용한다.
- 공개 키와 legacy anon 키의 정상 API 접근을 확인했다. 권한 없는 관리자 RPC 실행은 차단된다.
- 잘못된 리드·챗봇 요청은 400으로 응답한다. 실제 리드 제출이나 외부 알림 테스트는 수행하지 않았다.
- Compass 로그인 페이지 200, 미인증 API 401. 저장된 로컬 팀 비밀번호가 운영 비밀번호와 일치하지 않아 **Compass 로그인 후 화면은 미검증**이다. 기존 인증 설정은 바꾸지 않았고, 대상 DB 직접 연결 및 Home의 CRM 조회는 검증했다.
- `check:db --strict`, `check:alpha-db --strict`, `check:admin-rbac`, Cron 검사가 최종 환경에서 통과했다. 검증된 Production 코드의 격리된 작업 공간에서 typecheck → strict ESLint → build가 순서대로 통과했다.

## 원본 보관과 후속 배포

원본의 public 156개, crm 34개, Auth 22개, Storage 2개 테이블에 총 214개의 쓰기 방지 트리거를 적용했다. 오래된 앱·브라우저·로컬 스크립트가 원본에 새 데이터를 쌓는 것을 차단한다. 읽기와 관리 접근은 유지한다. `edu12`는 독립 서비스 가능성이 있어 원본 쓰기를 차단하지 않았으며, 대상에는 스냅샷만 복제했다. 이관 완료를 이유로 원본 프로젝트를 삭제하면 안 된다.

한국 프로젝트가 운영 쓰기를 받기 시작했으므로 원본으로 단순히 도메인만 되돌리면 데이터가 분리된다. 복귀가 필요하면 다시 쓰기를 중지하고 한국에서 발생한 변경을 먼저 대조해야 한다. 홈페이지 사용자는 프로젝트 변경으로 재로그인이 필요할 수 있다.

두 저장소의 `vercel.json`은 `icn1`로 수정하고, 검증된 운영 커밋을 기준으로 별도 이관 브랜치에 기록한다. **운영 브랜치에는 아직 반영되지 않았다.** 다음 Git 배포에 이 변경을 반드시 포함해야 한다. 현재 원격 운영 브랜치의 `sin1` 설정을 그대로 배포하면 Vercel 기본 리전보다 우선하여 실행 위치가 되돌아갈 수 있다. 이번 운영 전환에서는 기존 Production 코드만 배포했으며, 별도의 미배포 커밋이나 작업 중 변경을 함께 배포하지 않았다.

비공개 백업·접속 정보·원본 덤프·검증 상세는 Git ignored `tmp/supabase-korea-20260914/`에 있다. 디렉터리 권한은 700, 파일은 600으로 관리한다. 인증 해시와 업무 데이터가 포함되므로 Git에 추가하거나 공개 공유하지 않는다.
