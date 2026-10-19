// submitLeadCapture 부수효과 골든 로그 — 시나리오별 호출 순서와 인자, 응답.
//
// lib/server/lead-capture.ts 의 저장 뒤 블록을 runLeadCaptureEffects 로 옮기기 **전에**
// tests/server/fixtures/lead-capture-effects-harness.ts 의 녹화기로 현재 코드에서 뽑았다
// (설계 META-RECEIVER-FINAL §4-2 H3). 손으로 고치지 않는다 — 부수효과를 의도적으로 바꿀 때만
// 녹화기를 다시 돌려 차이를 리뷰한다. JSON 이라 값이 undefined 인 키는 빠져 있고, 비교는
// toEqual(undefined 키 무시)로 한다.

export const GOLDEN_EFFECT_LOGS: Record<string, unknown[]> = {
  "contact_page": [
    [
      "getResolvedSettings"
    ],
    [
      "saveLead",
      {
        "source": "contact_page",
        "name": "골든 문의자",
        "org": "골든 테스트학원",
        "role": "원장",
        "size": "30",
        "email": "golden.contact@example.com",
        "phone": "010-0000-1001",
        "branch": "청주",
        "message": "골든 문의 본문",
        "timestamp": "2026-09-15T02:00:00.000Z",
        "marketingConsent": true,
        "sourceDetail": "도입 상담",
        "utmSource": "google",
        "utmMedium": "cpc",
        "utmCampaign": "golden-campaign",
        "gclid": "golden-gclid",
        "landingPage": "https://classin.kr/landing",
        "currentPage": "https://classin.kr/contact",
        "referrer": "https://search.example.com/",
        "anonymousId": "anon-golden-contact",
        "source_detail": "도입 상담",
        "utm_source": "google",
        "utm_medium": "cpc",
        "utm_campaign": "golden-campaign",
        "landing_page": "https://classin.kr/landing",
        "current_page": "https://classin.kr/contact",
        "anonymous_id": "anon-golden-contact"
      }
    ],
    [
      "deferTask"
    ],
    [
      "postJson:sheet",
      {
        "source": "contact_page",
        "name": "골든 문의자",
        "org": "골든 테스트학원",
        "role": "원장",
        "size": "30",
        "email": "golden.contact@example.com",
        "phone": "010-0000-1001",
        "branch": "청주",
        "message": "골든 문의 본문",
        "timestamp": "2026-09-15T02:00:00.000Z",
        "marketingConsent": true,
        "sourceDetail": "도입 상담",
        "utmSource": "google",
        "utmMedium": "cpc",
        "utmCampaign": "golden-campaign",
        "gclid": "golden-gclid",
        "landingPage": "https://classin.kr/landing",
        "currentPage": "https://classin.kr/contact",
        "referrer": "https://search.example.com/",
        "anonymousId": "anon-golden-contact"
      }
    ],
    [
      "postJson:leadWebhook",
      {
        "source": "contact_page",
        "name": "골든 문의자",
        "org": "골든 테스트학원",
        "role": "원장",
        "size": "30",
        "email": "golden.contact@example.com",
        "phone": "010-0000-1001",
        "branch": "청주",
        "message": "골든 문의 본문",
        "timestamp": "2026-09-15T02:00:00.000Z",
        "marketingConsent": true,
        "sourceDetail": "도입 상담",
        "utmSource": "google",
        "utmMedium": "cpc",
        "utmCampaign": "golden-campaign",
        "gclid": "golden-gclid",
        "landingPage": "https://classin.kr/landing",
        "currentPage": "https://classin.kr/contact",
        "referrer": "https://search.example.com/",
        "anonymousId": "anon-golden-contact"
      }
    ],
    [
      "postJson:channelTalk",
      {
        "event": "new_lead",
        "source": "contact_page",
        "sourceDetail": "도입 상담",
        "name": "골든 문의자",
        "org": "골든 테스트학원",
        "phone": "010-0000-1001",
        "email": "golden.contact@example.com",
        "message": "원장 / 예상 30 / 골든 문의 본문",
        "timestamp": "2026-09-15T02:00:00.000Z"
      }
    ],
    [
      "upsertSubscriber",
      {
        "name": "골든 문의자",
        "email": "golden.contact@example.com",
        "org": "골든 테스트학원",
        "role": "원장",
        "size": "30",
        "phone": "010-0000-1001",
        "tags": [],
        "source": "도입 상담"
      }
    ],
    [
      "triggerOnSubmitRules",
      {
        "email": "golden.contact@example.com",
        "name": "골든 문의자",
        "org": "골든 테스트학원",
        "role": "원장",
        "source": "contact_page"
      }
    ],
    [
      "sendServerConversion",
      {
        "eventId": "lead:lead-golden-contact",
        "metaEventName": "Lead",
        "ga4EventName": "generate_lead",
        "requestMeta": {
          "clientIp": "203.0.113.10",
          "userAgent": "golden-agent/1.0",
          "sourceUrl": "https://classin.kr/contact?from=request-meta",
          "anonymousId": "anon-golden-contact",
          "gaClientId": "GA1.1.1111111111.1789000000",
          "fbp": "fb.1.1789000000000.1111111111",
          "fbc": null,
          "consent": {
            "analytics": true,
            "marketing": true
          }
        },
        "sourceUrl": "https://classin.kr/contact",
        "user": {
          "email": "golden.contact@example.com",
          "phone": "010-0000-1001",
          "externalId": "lead-golden-contact",
          "allowHashedUserData": true
        },
        "customData": {
          "lead_id": "lead-golden-contact",
          "source": "contact_page",
          "source_detail": "도입 상담"
        }
      }
    ],
    [
      "deferTask"
    ],
    [
      "createCrmCustomerEvent",
      {
        "targetType": "lead",
        "targetId": "lead-golden-contact",
        "targetLabel": "골든 테스트학원",
        "sourceType": "site_inflow",
        "title": "홈페이지 상담 신청",
        "summary": "문의 · https://classin.kr/contact",
        "occurredAt": "2026-09-15T02:00:00.000Z"
      }
    ],
    [
      "returned",
      {
        "status": 200,
        "body": {
          "ok": true,
          "stored": true,
          "merged": false,
          "leadId": "lead-golden-contact",
          "conversionEventId": "lead:lead-golden-contact",
          "warnings": []
        }
      }
    ],
    [
      "deferred:run"
    ],
    [
      "stitchIdentity",
      {
        "anonymousId": "anon-golden-contact",
        "leadId": "lead-golden-contact"
      }
    ],
    [
      "deferred:run"
    ],
    [
      "emitNotificationEvent:lead.created",
      {
        "eventType": "lead.created",
        "notificationType": "action_required",
        "categoryTag": "lead",
        "severity": "info",
        "scopeTag": "org_admin",
        "title": "새 리드: 골든 테스트학원",
        "message": "골든 문의자 / 골든 테스트학원 / 원장 / 예상 사용자 30 / contact_page",
        "routeUrl": "/admin/crm",
        "source": "lead",
        "sourceId": "lead-golden-contact",
        "payload": {
          "leadId": "lead-golden-contact",
          "source": "contact_page",
          "sourceDetail": "도입 상담",
          "name": "골든 문의자",
          "org": "골든 테스트학원",
          "role": "원장",
          "size": "30",
          "email": "golden.contact@example.com",
          "phone": "010-0000-1001",
          "message": "골든 문의 본문",
          "utmSource": "google",
          "utmMedium": "cpc",
          "utmCampaign": "golden-campaign",
          "gclid": "golden-gclid",
          "landingPage": "https://classin.kr/landing",
          "currentPage": "https://classin.kr/contact",
          "referrer": "https://search.example.com/"
        },
        "channels": []
      }
    ]
  ],
  "demo_modal": [
    [
      "getResolvedSettings"
    ],
    [
      "saveLead",
      {
        "source": "demo_modal",
        "name": "골든 데모",
        "org": "골든 데모학원",
        "role": "실장",
        "size": "100",
        "email": "demo.golden@example.com",
        "phone": "010-0000-1002",
        "timestamp": "2026-09-15T02:00:00.000Z",
        "marketingConsent": false,
        "eventSlug": "golden-seminar",
        "leadMagnet": "golden-guide-pdf",
        "landingPage": "https://classin.kr/demo",
        "notes": "[event:golden-seminar]",
        "lead_magnet": "golden-guide-pdf",
        "landing_page": "https://classin.kr/demo"
      }
    ],
    [
      "postJson:sheet",
      {
        "source": "demo_modal",
        "name": "골든 데모",
        "org": "골든 데모학원",
        "role": "실장",
        "size": "100",
        "email": "demo.golden@example.com",
        "phone": "010-0000-1002",
        "timestamp": "2026-09-15T02:00:00.000Z",
        "marketingConsent": false,
        "eventSlug": "golden-seminar",
        "leadMagnet": "golden-guide-pdf",
        "landingPage": "https://classin.kr/demo"
      }
    ],
    [
      "triggerOnSubmitRules",
      {
        "email": "demo.golden@example.com",
        "name": "골든 데모",
        "org": "골든 데모학원",
        "role": "실장",
        "source": "demo_modal"
      }
    ],
    [
      "sendServerConversion",
      {
        "eventId": "lead:lead-golden-demo",
        "metaEventName": "Lead",
        "ga4EventName": "generate_lead",
        "requestMeta": null,
        "sourceUrl": "https://classin.kr/demo",
        "user": {
          "email": "demo.golden@example.com",
          "phone": "010-0000-1002",
          "externalId": "lead-golden-demo",
          "allowHashedUserData": false
        },
        "customData": {
          "lead_id": "lead-golden-demo",
          "source": "demo_modal",
          "lead_magnet": "golden-guide-pdf",
          "event_slug": "golden-seminar"
        }
      }
    ],
    [
      "emitNotificationEvent:lead.created",
      {
        "eventType": "lead.created",
        "notificationType": "action_required",
        "categoryTag": "lead",
        "severity": "info",
        "scopeTag": "org_admin",
        "title": "행사 신청: 골든 데모학원",
        "message": "골든 데모 / 골든 데모학원 / 실장 / 예상 사용자 100 / demo_modal",
        "routeUrl": "/admin/crm",
        "source": "lead",
        "sourceId": "lead-golden-demo",
        "payload": {
          "leadId": "lead-golden-demo",
          "source": "demo_modal",
          "leadMagnet": "golden-guide-pdf",
          "name": "골든 데모",
          "org": "골든 데모학원",
          "role": "실장",
          "size": "100",
          "email": "demo.golden@example.com",
          "phone": "010-0000-1002",
          "landingPage": "https://classin.kr/demo"
        },
        "channels": []
      }
    ],
    [
      "createCrmCustomerEvent",
      {
        "targetType": "lead",
        "targetId": "lead-golden-demo",
        "targetLabel": "골든 데모학원",
        "sourceType": "site_inflow",
        "title": "홈페이지 상담 신청",
        "summary": "데모 신청 · https://classin.kr/demo",
        "occurredAt": "2026-09-15T02:00:00.000Z"
      }
    ],
    [
      "returned",
      {
        "status": 200,
        "body": {
          "ok": true,
          "stored": true,
          "merged": false,
          "leadId": "lead-golden-demo",
          "conversionEventId": "lead:lead-golden-demo",
          "warnings": []
        }
      }
    ]
  ],
  "meta_lead_ads": [
    [
      "getResolvedSettings"
    ],
    [
      "saveLead",
      {
        "source": "meta_lead_ads",
        "name": "테스트 리드",
        "org": "테스트학원",
        "role": "원장",
        "size": "50-100",
        "email": "test.lead@example.com",
        "phone": "010-0000-0001",
        "branch": "청주",
        "message": "Meta Lead Ads\nleadgen_id=900000000000001\npage_id=100000000000001\nform_id=200000000000001\ncampaign=테스트 캠페인 A\nadset=테스트 세트 A\nad=  테스트 광고 A  \nfields=full_name: 테스트 리드 / email: Test.Lead@Example.com / phone_number: 010-0000-0001 / company_name: 테스트학원 / job_title: 원장 / student_count: 50-100 / city: 청주 / marketing_consent: Yes",
        "timestamp": "2026-09-15T02:00:00.000Z",
        "marketingConsent": true,
        "sourceDetail": "테스트 광고 A",
        "utmSource": "meta",
        "utmMedium": "lead_ads",
        "utmCampaign": "테스트 캠페인 A",
        "utmTerm": "테스트 세트 A",
        "utmContent": "테스트 광고 A",
        "source_detail": "테스트 광고 A",
        "utm_source": "meta",
        "utm_medium": "lead_ads",
        "utm_campaign": "테스트 캠페인 A",
        "utm_term": "테스트 세트 A",
        "utm_content": "테스트 광고 A"
      }
    ],
    [
      "postJson:leadWebhook",
      {
        "source": "meta_lead_ads",
        "name": "테스트 리드",
        "org": "테스트학원",
        "role": "원장",
        "size": "50-100",
        "email": "test.lead@example.com",
        "phone": "010-0000-0001",
        "branch": "청주",
        "message": "Meta Lead Ads\nleadgen_id=900000000000001\npage_id=100000000000001\nform_id=200000000000001\ncampaign=테스트 캠페인 A\nadset=테스트 세트 A\nad=  테스트 광고 A  \nfields=full_name: 테스트 리드 / email: Test.Lead@Example.com / phone_number: 010-0000-0001 / company_name: 테스트학원 / job_title: 원장 / student_count: 50-100 / city: 청주 / marketing_consent: Yes",
        "timestamp": "2026-09-15T02:00:00.000Z",
        "marketingConsent": true,
        "sourceDetail": "테스트 광고 A",
        "utmSource": "meta",
        "utmMedium": "lead_ads",
        "utmCampaign": "테스트 캠페인 A",
        "utmTerm": "테스트 세트 A",
        "utmContent": "테스트 광고 A"
      }
    ],
    [
      "postJson:channelTalk",
      {
        "event": "new_lead",
        "source": "meta_lead_ads",
        "sourceDetail": "테스트 광고 A",
        "name": "테스트 리드",
        "org": "테스트학원",
        "phone": "010-0000-0001",
        "email": "test.lead@example.com",
        "message": "원장 / 예상 50-100 / Meta Lead Ads\nleadgen_id=900000000000001\npage_id=100000000000001\nform_id=200000000000001\ncampaign=테스트 캠페인 A\nadset=테스트 세트 A\nad=  테스트 광고 A  \nfields=full_name: 테스트 리드 / email: Test.Lead@Example.com / phone_number: 010-0000-0001 / company_name: 테스트학원 / job_title: 원장 / student_count: 50-100 / city: 청주 / marketing_consent: Yes",
        "timestamp": "2026-09-15T02:00:00.000Z"
      }
    ],
    [
      "upsertSubscriber",
      {
        "name": "테스트 리드",
        "email": "test.lead@example.com",
        "org": "테스트학원",
        "role": "원장",
        "size": "50-100",
        "phone": "010-0000-0001",
        "tags": [
          "meta_lead_ads"
        ],
        "source": "테스트 광고 A"
      }
    ],
    [
      "triggerOnSubmitRules",
      {
        "email": "test.lead@example.com",
        "name": "테스트 리드",
        "org": "테스트학원",
        "role": "원장",
        "source": "meta_lead_ads"
      }
    ],
    [
      "sendServerConversion",
      {
        "eventId": "lead:lead-golden-meta",
        "metaEventName": "Lead",
        "ga4EventName": "generate_lead",
        "requestMeta": null,
        "user": {
          "email": "test.lead@example.com",
          "phone": "010-0000-0001",
          "externalId": "lead-golden-meta",
          "allowHashedUserData": true
        },
        "customData": {
          "lead_id": "lead-golden-meta",
          "source": "meta_lead_ads",
          "source_detail": "테스트 광고 A"
        }
      }
    ],
    [
      "emitNotificationEvent:lead.created",
      {
        "eventType": "lead.created",
        "notificationType": "action_required",
        "categoryTag": "lead",
        "severity": "info",
        "scopeTag": "org_admin",
        "title": "새 리드: 테스트학원",
        "message": "테스트 리드 / 테스트학원 / 원장 / 예상 사용자 50-100 / meta_lead_ads",
        "routeUrl": "/admin/crm",
        "source": "lead",
        "sourceId": "lead-golden-meta",
        "payload": {
          "leadId": "lead-golden-meta",
          "source": "meta_lead_ads",
          "sourceDetail": "테스트 광고 A",
          "name": "테스트 리드",
          "org": "테스트학원",
          "role": "원장",
          "size": "50-100",
          "email": "test.lead@example.com",
          "phone": "010-0000-0001",
          "message": "Meta Lead Ads\nleadgen_id=900000000000001\npage_id=100000000000001\nform_id=200000000000001\ncampaign=테스트 캠페인 A\nadset=테스트 세트 A\nad=  테스트 광고 A  \nfields=full_name: 테스트 리드 / email: Test.Lead@Example.com / phone_number: 010-0000-0001 / company_name: 테스트학원 / job_title: 원장 / student_count: 50-100 / city: 청주 / marketing_consent: Yes",
          "utmSource": "meta",
          "utmMedium": "lead_ads",
          "utmCampaign": "테스트 캠페인 A",
          "utmTerm": "테스트 세트 A",
          "utmContent": "테스트 광고 A"
        },
        "channels": []
      }
    ],
    [
      "returned",
      {
        "status": 200,
        "body": {
          "ok": true,
          "stored": true,
          "merged": false,
          "leadId": "lead-golden-meta",
          "conversionEventId": "lead:lead-golden-meta",
          "warnings": []
        }
      }
    ]
  ],
  "contact_page_storage_failure": [
    [
      "getResolvedSettings"
    ],
    [
      "saveLead",
      {
        "source": "contact_page",
        "name": "골든 문의자",
        "org": "골든 테스트학원",
        "role": "원장",
        "size": "30",
        "email": "golden.contact@example.com",
        "phone": "010-0000-1001",
        "branch": "청주",
        "message": "골든 문의 본문",
        "timestamp": "2026-09-15T02:00:00.000Z",
        "marketingConsent": true,
        "sourceDetail": "도입 상담",
        "utmSource": "google",
        "utmMedium": "cpc",
        "utmCampaign": "golden-campaign",
        "gclid": "golden-gclid",
        "landingPage": "https://classin.kr/landing",
        "currentPage": "https://classin.kr/contact",
        "referrer": "https://search.example.com/",
        "anonymousId": "anon-golden-contact",
        "source_detail": "도입 상담",
        "utm_source": "google",
        "utm_medium": "cpc",
        "utm_campaign": "golden-campaign",
        "landing_page": "https://classin.kr/landing",
        "current_page": "https://classin.kr/contact",
        "anonymous_id": "anon-golden-contact"
      }
    ],
    [
      "postJson:sheet",
      {
        "source": "contact_page",
        "name": "골든 문의자",
        "org": "골든 테스트학원",
        "role": "원장",
        "size": "30",
        "email": "golden.contact@example.com",
        "phone": "010-0000-1001",
        "branch": "청주",
        "message": "골든 문의 본문",
        "timestamp": "2026-09-15T02:00:00.000Z",
        "marketingConsent": true,
        "sourceDetail": "도입 상담",
        "utmSource": "google",
        "utmMedium": "cpc",
        "utmCampaign": "golden-campaign",
        "gclid": "golden-gclid",
        "landingPage": "https://classin.kr/landing",
        "currentPage": "https://classin.kr/contact",
        "referrer": "https://search.example.com/",
        "anonymousId": "anon-golden-contact"
      }
    ],
    [
      "upsertSubscriber",
      {
        "name": "골든 문의자",
        "email": "golden.contact@example.com",
        "org": "골든 테스트학원",
        "role": "원장",
        "size": "30",
        "phone": "010-0000-1001",
        "tags": [],
        "source": "도입 상담"
      }
    ],
    [
      "triggerOnSubmitRules",
      {
        "email": "golden.contact@example.com",
        "name": "골든 문의자",
        "org": "골든 테스트학원",
        "role": "원장",
        "source": "contact_page"
      }
    ],
    [
      "emitNotificationEvent:integration.webhook_failed",
      {
        "eventType": "integration.webhook_failed",
        "notificationType": "incident",
        "categoryTag": "system",
        "severity": "critical",
        "scopeTag": "critical_control",
        "title": "리드 저장 또는 전달 실패",
        "message": "Failed to store the lead record.",
        "routeUrl": "/admin/settings",
        "source": "lead",
        "payload": {
          "source": "contact_page",
          "errors": [],
          "storageError": "Failed to store the lead record."
        },
        "channels": [
          "wecom_webhook",
          "email"
        ]
      }
    ],
    [
      "returned",
      {
        "status": 502,
        "body": {
          "ok": false,
          "error": "상담 요청을 어드민에 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          "details": [
            "Failed to store the lead record."
          ]
        }
      }
    ]
  ],
  "contact_page_delivery_failures": [
    [
      "getResolvedSettings"
    ],
    [
      "saveLead",
      {
        "source": "contact_page",
        "name": "골든 문의자",
        "org": "골든 테스트학원",
        "role": "원장",
        "size": "30",
        "email": "golden.contact@example.com",
        "phone": "010-0000-1001",
        "branch": "청주",
        "message": "골든 문의 본문",
        "timestamp": "2026-09-15T02:00:00.000Z",
        "marketingConsent": true,
        "sourceDetail": "도입 상담",
        "utmSource": "google",
        "utmMedium": "cpc",
        "utmCampaign": "golden-campaign",
        "gclid": "golden-gclid",
        "landingPage": "https://classin.kr/landing",
        "currentPage": "https://classin.kr/contact",
        "referrer": "https://search.example.com/",
        "source_detail": "도입 상담",
        "utm_source": "google",
        "utm_medium": "cpc",
        "utm_campaign": "golden-campaign",
        "landing_page": "https://classin.kr/landing",
        "current_page": "https://classin.kr/contact"
      }
    ],
    [
      "postJson:sheet",
      {
        "source": "contact_page",
        "name": "골든 문의자",
        "org": "골든 테스트학원",
        "role": "원장",
        "size": "30",
        "email": "golden.contact@example.com",
        "phone": "010-0000-1001",
        "branch": "청주",
        "message": "골든 문의 본문",
        "timestamp": "2026-09-15T02:00:00.000Z",
        "marketingConsent": true,
        "sourceDetail": "도입 상담",
        "utmSource": "google",
        "utmMedium": "cpc",
        "utmCampaign": "golden-campaign",
        "gclid": "golden-gclid",
        "landingPage": "https://classin.kr/landing",
        "currentPage": "https://classin.kr/contact",
        "referrer": "https://search.example.com/"
      }
    ],
    [
      "postJson:leadWebhook",
      {
        "source": "contact_page",
        "name": "골든 문의자",
        "org": "골든 테스트학원",
        "role": "원장",
        "size": "30",
        "email": "golden.contact@example.com",
        "phone": "010-0000-1001",
        "branch": "청주",
        "message": "골든 문의 본문",
        "timestamp": "2026-09-15T02:00:00.000Z",
        "marketingConsent": true,
        "sourceDetail": "도입 상담",
        "utmSource": "google",
        "utmMedium": "cpc",
        "utmCampaign": "golden-campaign",
        "gclid": "golden-gclid",
        "landingPage": "https://classin.kr/landing",
        "currentPage": "https://classin.kr/contact",
        "referrer": "https://search.example.com/"
      }
    ],
    [
      "postJson:channelTalk",
      {
        "event": "new_lead",
        "source": "contact_page",
        "sourceDetail": "도입 상담",
        "name": "골든 문의자",
        "org": "골든 테스트학원",
        "phone": "010-0000-1001",
        "email": "golden.contact@example.com",
        "message": "원장 / 예상 30 / 골든 문의 본문",
        "timestamp": "2026-09-15T02:00:00.000Z"
      }
    ],
    [
      "upsertSubscriber",
      {
        "name": "골든 문의자",
        "email": "golden.contact@example.com",
        "org": "골든 테스트학원",
        "role": "원장",
        "size": "30",
        "phone": "010-0000-1001",
        "tags": [],
        "source": "도입 상담"
      }
    ],
    [
      "triggerOnSubmitRules",
      {
        "email": "golden.contact@example.com",
        "name": "골든 문의자",
        "org": "골든 테스트학원",
        "role": "원장",
        "source": "contact_page"
      }
    ],
    [
      "sendServerConversion",
      {
        "eventId": "lead:lead-golden-delivery",
        "metaEventName": "Lead",
        "ga4EventName": "generate_lead",
        "requestMeta": null,
        "sourceUrl": "https://classin.kr/contact",
        "user": {
          "email": "golden.contact@example.com",
          "phone": "010-0000-1001",
          "externalId": "lead-golden-delivery",
          "allowHashedUserData": true
        },
        "customData": {
          "lead_id": "lead-golden-delivery",
          "source": "contact_page",
          "source_detail": "도입 상담"
        }
      }
    ],
    [
      "emitNotificationEvent:lead.created",
      {
        "eventType": "lead.created",
        "notificationType": "action_required",
        "categoryTag": "lead",
        "severity": "info",
        "scopeTag": "org_admin",
        "title": "새 리드: 골든 테스트학원",
        "message": "골든 문의자 / 골든 테스트학원 / 원장 / 예상 사용자 30 / contact_page",
        "routeUrl": "/admin/crm",
        "source": "lead",
        "sourceId": "lead-golden-delivery",
        "payload": {
          "leadId": "lead-golden-delivery",
          "source": "contact_page",
          "sourceDetail": "도입 상담",
          "name": "골든 문의자",
          "org": "골든 테스트학원",
          "role": "원장",
          "size": "30",
          "email": "golden.contact@example.com",
          "phone": "010-0000-1001",
          "message": "골든 문의 본문",
          "utmSource": "google",
          "utmMedium": "cpc",
          "utmCampaign": "golden-campaign",
          "gclid": "golden-gclid",
          "landingPage": "https://classin.kr/landing",
          "currentPage": "https://classin.kr/contact",
          "referrer": "https://search.example.com/"
        },
        "channels": []
      }
    ],
    [
      "createCrmCustomerEvent",
      {
        "targetType": "lead",
        "targetId": "lead-golden-delivery",
        "targetLabel": "골든 테스트학원",
        "sourceType": "site_inflow",
        "title": "홈페이지 상담 신청",
        "summary": "문의 · https://classin.kr/contact",
        "occurredAt": "2026-09-15T02:00:00.000Z"
      }
    ],
    [
      "emitNotificationEvent:integration.webhook_failed",
      {
        "eventType": "integration.webhook_failed",
        "notificationType": "incident",
        "categoryTag": "system",
        "severity": "warning",
        "scopeTag": "critical_control",
        "title": "리드 전달 경고가 발생했습니다",
        "message": "Webhook: 500 | golden subscriber down",
        "routeUrl": "/admin/settings",
        "source": "lead",
        "sourceId": "lead-golden-delivery",
        "payload": {
          "leadId": "lead-golden-delivery",
          "source": "contact_page",
          "errors": [
            "Webhook: 500",
            "golden subscriber down"
          ]
        },
        "channels": [
          "wecom_webhook",
          "email"
        ]
      }
    ],
    [
      "returned",
      {
        "status": 200,
        "body": {
          "ok": true,
          "stored": true,
          "merged": false,
          "leadId": "lead-golden-delivery",
          "conversionEventId": "lead:lead-golden-delivery",
          "warnings": [
            "Webhook: 500",
            "golden subscriber down"
          ]
        }
      }
    ]
  ],
  "demo_modal_suppressed_notification": [
    [
      "getResolvedSettings"
    ],
    [
      "saveLead",
      {
        "source": "demo_modal",
        "name": "골든 데모",
        "org": "골든 데모학원",
        "role": "실장",
        "size": "100",
        "email": "demo.golden@example.com",
        "phone": "010-0000-1002",
        "timestamp": "2026-09-15T02:00:00.000Z",
        "marketingConsent": false,
        "leadMagnet": "golden-guide-pdf",
        "landingPage": "https://classin.kr/demo",
        "lead_magnet": "golden-guide-pdf",
        "landing_page": "https://classin.kr/demo"
      }
    ],
    [
      "triggerOnSubmitRules",
      {
        "email": "demo.golden@example.com",
        "name": "골든 데모",
        "org": "골든 데모학원",
        "role": "실장",
        "source": "demo_modal"
      }
    ],
    [
      "sendServerConversion",
      {
        "eventId": "lead:lead-golden-suppressed",
        "metaEventName": "Lead",
        "ga4EventName": "generate_lead",
        "requestMeta": null,
        "sourceUrl": "https://classin.kr/demo",
        "user": {
          "email": "demo.golden@example.com",
          "phone": "010-0000-1002",
          "externalId": "lead-golden-suppressed",
          "allowHashedUserData": false
        },
        "customData": {
          "lead_id": "lead-golden-suppressed",
          "source": "demo_modal",
          "lead_magnet": "golden-guide-pdf"
        }
      }
    ],
    [
      "createCrmCustomerEvent",
      {
        "targetType": "lead",
        "targetId": "lead-golden-suppressed",
        "targetLabel": "골든 데모학원",
        "sourceType": "site_inflow",
        "title": "홈페이지 상담 신청",
        "summary": "데모 신청 · https://classin.kr/demo",
        "occurredAt": "2026-09-15T02:00:00.000Z"
      }
    ],
    [
      "returned",
      {
        "status": 200,
        "body": {
          "ok": true,
          "stored": true,
          "merged": false,
          "leadId": "lead-golden-suppressed",
          "conversionEventId": "lead:lead-golden-suppressed",
          "warnings": []
        }
      }
    ]
  ]
}
