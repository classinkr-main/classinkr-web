---
title: Neo CRM API 연동 협의안
status: draft
owner: KR Branch
last_updated: 2026-04-29
target: ClassIn HQ (Neo CRM 운영팀)
---

# Neo CRM API 연동 협의안

> 이 문서는 **본사(ClassIn HQ) Neo CRM 운영팀**과 연동 가능성을 협의하기 위한 한국 지사(KR)의 초안이다.
> 한국 홈페이지(classin_home)에서 발생하는 리드/고객 데이터를 Neo CRM에 자동 등록할 수 있는지 함께 검토하고, API 스펙·일정·역할 분담을 조율하는 것이 목적이다.
>
> 작성 기준 시점: 2026-04-29
> 한국 측 시스템 현황은 [docs/active/architecture-schema-erd.md](architecture-schema-erd.md), [docs/active/supabase-backend-masterplan.md](supabase-backend-masterplan.md) 참고.

---

## 0. 한 줄 요약

KR 홈페이지에서 들어오는 리드를 **실시간으로 Neo CRM에 자동 등록**할 수 있도록, 본사 Neo CRM 운영팀과 API 연동 방식·필드 매핑·운영 절차를 함께 협의하고자 합니다.

---

## 1. 배경 (Why)

### 현재 상황

- KR 홈페이지(`classin_home`)는 자체 Supabase에 리드를 저장하고, 동시에 Make/Zapier/Channel Talk 등 **외부 웹훅 3종**으로 리드 사본을 흘려보내고 있음
- KR 어드민(`/admin/crm`)에서 리드를 자체 관리 중
- 본사 Neo CRM에는 KR 리드가 현재 **수동으로만** 옮겨가고 있어, 본사와 KR이 같은 리드 현황을 실시간으로 보기 어려움

### 문제

| 문제 | 비즈니스 영향 |
|---|---|
| KR ↔ 본사 리드 동기화 부재 | 글로벌 파이프라인 가시성이 낮아지고, 동일 리드가 중복 관리될 가능성 |
| 수동 이관 | 응답 지연(평균 24h+), 누락 가능성, 반복 운영 부담 |
| 데이터 포맷 불일치 | 추후 통합 분석/리포팅 시 추가 매핑 비용 발생 가능 |

### 목표

- KR 리드 발생 → **수 분 내** Neo CRM 등록
- 본사·KR 양쪽이 같은 리드 데이터를 기준으로 영업/마케팅 의사결정
- 향후 양방향 동기화로 확장(Phase 2)

---

## 2. 범위 (Scope)

### Phase 1 (MVP, 우선 협의 대상)

- **방향**: KR → Neo CRM (단방향, push)
- **트리거**: KR 홈페이지에서 리드 1건 생성/업데이트될 때마다
- **데이터**: 아래 §5 필드 매핑표 기준

### Phase 2 (차후 별도 합의)

- Neo CRM → KR (상태 변경 webhook)
- 고객사(Customer) / 거래(Deal) 객체 동기화
- 영업 담당자(Owner) 양방향 매핑

### 비범위(Out of Scope)

- 결제/계약 시스템 연동
- 본사 Neo CRM UI/UX 변경
- 기존 외부 웹훅 3종(Make/Zapier/Channel Talk) 대체 — 일단 병행 운영

---

## 3. 데이터 흐름 (Data Flow)

```text
[홈페이지 폼]
   │ POST /api/lead
   ▼
[KR Next.js Server]
   │ 1) Supabase `leads` INSERT
   │ 2) 외부 웹훅 3종 fan-out (현행 유지)
   │ 3) ★ Neo CRM API 호출 (신규) ★
   ▼
[Neo CRM]
```

- 호출 빈도: **이벤트 기반(real-time)**, 현재 트래픽 기준 일 수십~수백 건
- 실패 시 정책: KR 측에서 **최대 3회 retry(exponential backoff)** + 실패 리드는 KR 어드민에서 재전송 가능하도록 큐잉
- 향후 일배치 reconciliation(매일 자정)도 검토 가능 — idempotency 키 지원 여부는 본사 스펙 확인 후 결정

---

## 4. 필요한 엔드포인트 (Required Endpoints)

아래 엔드포인트는 KR 측에서 필요하다고 예상하는 항목입니다. 실제 path, method, 인증 방식은 본사 Neo CRM 표준에 맞춰 조정 가능합니다.

### 4-1. (MVP 우선) 리드 생성 / Upsert

| 항목 | 제안 / 확인 필요 |
|---|---|
| Method | `POST` |
| Path 예시 | `/api/v1/leads` 또는 `/api/v1/leads:upsert` |
| Idempotency | 외부 ID(예: `external_lead_id`) 기반 upsert 가능 여부 확인 희망 |
| 응답 | `{ id, status, created_at }` 또는 4xx/5xx 에러 |

### 4-2. (MVP 우선) 헬스체크 / 인증 검증

| 항목 | 제안 / 확인 필요 |
|---|---|
| Method | `GET` |
| Path 예시 | `/api/v1/ping` |
| 용도 | 배포 시 키 유효성 확인, 모니터링 |

### 4-3. (선택, Phase 2) 리드 단건 조회

| 항목 | 제안 / 확인 필요 |
|---|---|
| Method | `GET` |
| Path 예시 | `/api/v1/leads/{id}` |
| 용도 | KR 어드민에서 본사 처리 상태 확인 |

### 4-4. (선택, Phase 2) 리드 상태 변경 Webhook

| 항목 | 제안 / 확인 필요 |
|---|---|
| 방향 | Neo CRM → KR |
| Endpoint (KR이 제공) | `POST https://classin.kr/api/webhook/neo-crm` |
| 페이로드 | `{ external_id, status, owner, updated_at }` |
| 보안 | HMAC SHA-256 signature header |

---

## 5. 필드 매핑표 (Field Mapping)

KR 측 `leads` 테이블 필드(현행) ↔ Neo CRM 필드(초안).
실제 매핑은 본사 Neo CRM 객체 스키마를 확인한 뒤 함께 확정합니다.

| # | KR 필드 | KR 타입/예시 | 필수 | Neo CRM 매핑 (가설) | 비고 |
|---|---|---|---|---|---|
| 1 | `id` | uuid | ✅ | `external_lead_id` | KR Supabase row id, idempotency 키로 사용 희망 |
| 2 | `source` | string (`demo_modal`, `contact_page`, `newsletter`, …) | ✅ | `source` / `lead_source` | enum 매핑 표 협의 필요 |
| 3 | `name` | string | △ | `contact_name` | source에 따라 필수성 다름 |
| 4 | `email` | string (lowercased) | △ | `email` | RFC 5322 검증됨 |
| 5 | `phone` | string | △ | `phone` | E.164 정규화 미적용 — 본사 표준에 맞춰 KR에서 처리 가능 |
| 6 | `org` | string | △ | `account_name` / `company` | 학교/기관명 |
| 7 | `role` | string | ◯ | `contact_title` | 직책 |
| 8 | `size` | string (`<50`, `50-200`, …) | ◯ | `account_size` | 기관 규모 enum |
| 9 | `message` | text | ◯ | `note` / `description` | 자유 텍스트 |
| 10 | `timestamp` (`created_at`) | ISO 8601 | ✅ | `created_at` | 타임존 KST |
| 11 | `status` | enum (`new`/`contacted`/`converted`/`closed`) | ✅ | `status` | KR 자체 상태. 본사 상태 체계와 매핑 필요 |
| 12 | `branch` | string | ◯ | `region` / `branch_code` | 항상 `KR` 고정값 송부 예정 |
| 13 | `assigned_to` | string | ◯ | `owner_email` | KR 영업 담당자 이메일 |
| 14 | (신규) `utm_source/medium/campaign` | string | ◯ | `utm_*` | KR 측 schema 확장 예정 |
| 15 | (신규) `marketing_consent` | bool | ◯ | `consent_marketing` | GDPR/PIPA 대응 |

**필수성(필수/△선택조건부/◯선택)**, **enum 값**, **타임존**은 본사 스키마 확인 후 확정.

---

## 6. 인증 / 보안 (Auth & Security)

본사 Neo CRM 표준에 맞춰 확인하고 싶은 항목:

| 항목 | KR 선호 / 질문 |
|---|---|
| 인증 방식 | API Key (Bearer) 또는 OAuth2 client_credentials 중 본사 표준 |
| 키 발급 단위 | 가능하다면 환경별(prod / staging) 별도 키 발급 |
| 키 로테이션 정책 | 주기? 사전 통지 가능 여부? |
| Transport | HTTPS only, TLS 1.2+ |
| IP whitelist | 필요 여부 — 필요 시 KR 고정 IP 제공 가능 (Vercel egress 또는 자체 프록시) |
| Rate limit | 초당/분당 한도? burst 허용치? |
| 데이터 보호 | 개인정보(이메일/전화) 저장 위치, 보존 기간, 삭제 요청 처리 절차 |
| 감사 로그 | 필요 시 본사 측 호출 로그를 KR이 확인할 수 있는 방법 |

KR 측 준수:
- 키는 Vercel 환경변수로만 보관, 코드/리포에 미커밋
- 응답 로그에서 PII 마스킹
- KR PIPA(개인정보보호법) 준수 — 동의 받은 리드만 송부

---

## 7. 환경 / 일정 (Environments & Timeline)

### 환경

| 환경 | KR | 본사 (확인 필요) |
|---|---|---|
| Production | `https://classin.kr` | `https://api.neo-crm.example.com` |
| Staging | `https://staging.classin.kr` | `https://api-staging.neo-crm.example.com` |

### 일정 제안 (초안 — 본사 가용성에 따라 조정 가능)

| 마일스톤 | 기간 | 주관 / 협업 |
|---|---|---|
| M1. 킥오프 / 스펙 방향 확인 | 1~2주 | 본사 + KR |
| M2. Staging 환경·샘플 응답 확인 | 1주 | 본사 + KR |
| M3. KR `/api/lead` 통합 + e2e 테스트 | 2주 | KR, 본사 검증 지원 |
| M4. Production 환경 확인 + 카나리 배포 | 1주 | 본사 + KR |
| M5. 전체 트래픽 전환 + 모니터링 1주 | 1주 | KR, 본사 모니터링 협업 |

총 **약 6~7주**를 예상하되, 본사 일정과 운영 표준에 맞춰 조정 가능합니다.

---

## 8. 운영 역할 분담 초안 (RACI)

아래는 KR 측에서 예상한 역할 분담 초안입니다. 실제 운영 방식은 본사 Neo CRM 팀의 표준 프로세스에 맞춰 조정 가능합니다.

| 항목 | KR | 본사 |
|---|---|---|
| KR → Neo CRM 호출 코드 | **R** | C |
| KR 측 retry/큐잉 | **R** | I |
| Neo CRM 엔드포인트 가동 | C | **R** |
| Rate limit / 장애 공지 | I | **R** |
| 필드 매핑 합의 | **R** | **R** |
| 개인정보 동의 수집 | **R** | I |
| 개인정보 보존/삭제 (Neo CRM 측) | I | **R** |
| 인증 키 관리 | C (자기 키만) | **R** |
| 장애 대응 채널 | C | **R** (담당 채널 확인) |

R=Responsible, A=Accountable, C=Consulted, I=Informed

---

## 9. 함께 확인할 항목 체크리스트

- [ ] API 베이스 URL (prod / staging)
- [ ] 인증 방식 + Staging 테스트 키
- [ ] OpenAPI(Swagger) 또는 Postman 컬렉션
- [ ] 리드 객체 스키마 + JSON 예시
- [ ] enum 값 표(source, status, size 등)
- [ ] 에러 코드 표 + 재시도 권장 정책
- [ ] Rate limit 수치
- [ ] 기술 협의 담당자 또는 담당 채널 (이름/이메일/메신저)
- [ ] 장애 통보 채널 (메일링리스트 / WeCom 채널 등)

---

## 10. 열린 질문 (Open Questions)

1. Neo CRM에 이미 동일 리드가 있을 때 정책: 덮어쓰기 / 무시 / 머지?
2. KR 어드민에서 영업 담당자가 `status`를 변경했을 때 본사 측에도 반영해야 하는가?
3. Neo CRM의 "고객사(Account)"와 KR의 "리드"는 분리 객체인가, 자동 변환되는가?
4. 본사 측 리드 owner가 KR 영업이 아닌 다른 지역 담당자로 자동 라우팅될 가능성? 라우팅 로직 공개 가능?
5. 본사 측 데이터 저장 위치(국가) — KR PIPA 국외이전 동의 문구 작성 시 필요

---

## 부록 A. Memo to HQ — English One-Pager

> Send this short version to HQ first. The full Korean draft can be attached as supporting context if needed.

**Subject:** Proposal to discuss Neo CRM integration for KR website leads

Hi Neo CRM team,

The ClassIn Korea branch (`classin_home`) currently captures website leads into our local Supabase store and forwards copies to a few marketing webhooks. These leads are not yet synced to Neo CRM automatically, so the KR team currently handles this manually. This creates some delay and makes it harder for HQ and KR to work from the same lead pipeline.

We would like to discuss the best way to integrate `classin_home` with Neo CRM so that new KR leads can be shared in near real time. If Neo CRM already has a standard integration pattern, we are happy to follow it.

**Items we would like to confirm with HQ:**

1. Whether Neo CRM has a standard API or integration method for creating/upserting leads.
2. Authentication approach for staging and production (API key, OAuth2, or another HQ standard).
3. Lead object schema: JSON example, required/optional fields, and enum values such as `source`, `status`, and `size`.
4. Error codes, rate limits, and recommended retry behavior.
5. Data storage location, retention policy, and deletion request process for KR PIPA compliance.
6. The right technical contact or channel for specification questions and rollout coordination.
7. (Optional Phase 2) Whether Neo CRM can send status/owner updates back to KR via webhook.

**What KR will deliver:**

- Server-side push from `/api/lead` with idempotency via our internal lead UUID.
- Up to 3 retries with exponential backoff; failed leads queued and surfaced in the KR admin UI.
- PII handling compliant with Korean PIPA (consent-gated, masked logs, key stored only in env).
- A draft mapping/timeline document for discussion, which we can adjust to HQ's Neo CRM standards.

**Initial timeline idea:** around 6-7 weeks from spec alignment to production rollout, adjustable based on HQ availability and process.

Please let us know:
(a) who would be the best team/contact to discuss this with, and
(b) whether this integration direction looks feasible from the Neo CRM side.

Thanks,
ClassIn Korea — Engineering

---

## 부록 B. 致总部沟通稿 — 中文一页摘要

> 用于初次发函。详细规范可作为附件提供，后续根据总部反馈调整。

**主题：** 关于韩国官网线索与 Neo CRM 对接的协作沟通

Neo CRM 团队您好：

ClassIn 韩国分公司（`classin_home`）目前会将官网线索保存在本地 Supabase，并同步给部分营销相关 Webhook。现在这些线索尚未自动同步到 Neo CRM，主要由 KR 团队人工整理和同步，因此在时效性、统一查看和后续跟进上会有一些不便。

我们希望和 Neo CRM 团队一起评估一个合适的对接方式，让韩国官网的新线索可以接近实时地进入 Neo CRM。若总部已有标准 API、集成流程或数据规范，KR 侧会优先配合总部标准。

**希望与总部确认的事项：**

1. Neo CRM 是否已有标准的线索创建/更新接口，或推荐的系统对接方式。
2. staging 与 production 环境的认证方式（API Key、OAuth2 或其他总部标准）。
3. 线索对象 Schema：JSON 示例、必填/选填字段、`source` / `status` / `size` 等枚举值。
4. 错误码、限流规则，以及总部建议的重试策略。
5. 韩国个人信息合规所需信息：数据存储国家/地区、保存期限、删除请求处理方式。
6. 适合本次技术沟通的联系人或沟通渠道。
7. （Phase 2，可选）后续是否可以支持 Neo CRM → KR 的 Webhook，用于线索状态/负责人变更回传。

**KR 侧可以负责的部分：**

- 在 `/api/lead` 服务端推送，使用内部 Lead UUID 实现幂等。
- 最多 3 次指数退避重试；失败线索入队并在 KR 后台展示，可手动重发。
- 遵循韩国《个人信息保护法》（PIPA）：仅推送已获得必要同意的线索，日志中对 PII 做脱敏处理，密钥仅保存在环境变量中。
- 准备字段映射、测试计划和上线节奏草案，并根据总部 Neo CRM 标准进行调整。

**初步时间预估：** 从规范确认到生产上线约 6-7 周，具体节奏可根据总部排期和流程一起调整。

烦请帮忙确认：
（a）这件事适合由哪个团队或联系人一起推进；
（b）从 Neo CRM 侧看，这个对接方向是否可行，是否有更推荐的方案。

谢谢，
ClassIn Korea — 工程团队

---

## 변경 이력

| 날짜 | 작성자 | 내용 |
|---|---|---|
| 2026-04-29 | KR Engineering | 초안 작성 |
| 2026-04-29 | KR Engineering | 본사 협업 요청 톤으로 문구 완화 및 중국어 요약 수정 |
