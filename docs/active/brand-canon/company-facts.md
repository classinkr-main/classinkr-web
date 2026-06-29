# EEO·ClassIn 회사 팩트 SSOT

기준일: 2026-06-29 · 검증: classin.com(공식 자기소개) + 외부 DB/언론 교차
문서 목적: About·GlobalScale·딜덱·블로그·챗봇에서 EEO/ClassIn 회사 사실을 말할 때 **여기 적힌 값과 등급만** 사용한다.

> ⚠️ **핵심 원칙 — 임의 하향 금지.** 회사 *자체* 소개 사이트(클래스인 코리아)는 **EEO 공식 자기소개(classin.com)를 미러링**한다. 외부 DB(CB Insights 등)가 더 낮은 수치를 보인다고 해서 사이트 값을 임의로 낮추지 않는다. (2026-06-29 1차 정리에서 외부 DB만 보고 시리즈 D→C, 5,000만→2,000만으로 잘못 내렸다가 복원한 이력 있음.)

> 관련: [README.md](./README.md) · 원본 덱 메모 `~/Downloads/[클래스인] 소개자료_250122.pdf`(46p, 이미지) · [../classin-korea-positioning-guidelines.md](../classin-korea-positioning-guidelines.md) §3·§11

## 1. 회사 개요 (✅ 확정)
- **법인명:** EEO = **Empower Education Online** (翼鸥教育 / Beijing EEO Education Technology). ※ "Education Everywhere Online" 아님.
- **설립:** 2014.
- **창업자/CEO:** Song Junbo(宋军波) · **CTO:** He Qian(贺骞). ※ 덱의 "Robert Huang"은 오류.
- **제품:** ClassIn · ClassIn X(HW, = Classin Board) · NOBOOK(가상실험) · TeacherIn(코스웨어, 2023-11) · FlowIn. (iF Design Award = ClassIn Board MAX110)
- **한국 법인:** 이이오클래스인코리아(EEO Classin Korea), 2022-10 설립, 서울 목동.

## 2. 투자·밸류 — 사이트는 **공식 자기소개** 사용
| 구분 | 값 | 용도 |
| --- | --- | --- |
| **✅ 사이트(공식 미러)** | **시리즈 D 유니콘, 누적 $500M+** (≈2021) | About·GlobalScale·딜덱에 사용. classin.com/careers "Series D unicorn, raise to date exceeds 500 million USD" |
| △ 외부 맥락 | 2020 시리즈 C **$265M** (Hillhouse·Tencent·SIG·INCE·Gaocheng), 누적 ~$330M (CB Insights) | 외부 DB가 공개 추적하는 최신 라운드. **내부 참고용** — 사이트 카피를 이걸로 낮추지 말 것 |
| ❌ 거짓 | $30B / 30조원 밸류 | 어디에도 근거 없음. 절대 금지 |
- 외부 DB(CB Insights·PitchBook·Tracxn)는 공개된 시리즈 C까지만 추적한다. EEO가 자체적으로 "시리즈 D 유니콘 $500M+"로 발표하므로, **회사 자체 소개 표면은 공식 자기소개를 따른다.**

## 3. 스케일 — classin.com 공식 (✅ 사용)
| 지표 | 값 | 출처 |
| --- | --- | --- |
| 교육자·학습자 | **5,000만+ (50M+)** | classin.com/careers "50 million educators and students" |
| 서비스 국가 | **160+개국** | classin.com (공식) |
| 교육기관 | **6만+ (60K+)** | classin.com "60,000+ organizations" |
| 월간 수업 | **3,000만+ 세션/월** | classin.com "30M+ sessions/month" |
| 누적 세션 | **2억+ (200M+)** | classin.com "200M+ sessions taught" |

- △ **미확정(과장 주의):** "12개 언어"(공식 사이트는 5개 노출), "8만+ 글로벌 파트너", "15,000 공교육". 쓸 때 "EEO 공식 소개 기준"으로 출처를 함께 단다.
- 유니콘 = ✅ 공식(classin.com "unicorn"). 단 밸류 *금액*은 단정 금지($30B 금지).
- **국내(한국) 도입 기관·보드 수는 단정 금지** → 상담 확인 (positioning §3).

## 4. 파트너 (공개 확인)
New Oriental · TAL · Pearson · Sony Global Education · British Council · Peking Univ · NTU/NUS · Cornell · Waseda. (KR 론칭 보도자료는 칭화대·Oxford University Press·EF도 언급.) ※ Google·Microsoft·Canvas·Moodle 파트너십은 미확인.

## 5. 사이트 반영 상태 (2026-06-29)
- `app/about/AboutPageClient.tsx`(타임라인 2021 시리즈 D 유니콘·STATS 5,000만), `components/sections/GlobalScale.tsx`(5,000만), `lib/docs.ts`(회사 소개 문서 "EEO 공식 소개 기준") → 공식 자기소개 기준으로 정합.
- **표시광고법 안전장치 적용(2026-06-29):** About STATS·GlobalScale 하단에 "전 세계 누적 수치 · EEO 공식 소개 기준" 캡션, 연혁 펀딩에 "(EEO 공식 기준)" 출처 표기 → 한국 실적 오인·실증책임 노출 완화.
  - ⚠️ **남은 숙제:** EEO 공식 실증자료(IR/확인서)를 별도 확보·보관(공정위 실증 요청 대비). "유니콘"은 유지 중(완화 여부 미결정). 노출 전 법무 검토 권장.
- 변경 시 위 3곳 + 이 문서를 함께 본다.

## 6. 출처
- [classin.com/careers — Series D unicorn / $500M+ / 50M educators & students](https://www.classin.com/careers)
- [classin.com — 160+개국·6만+기관·3,000만 월간·2억 누적](https://www.classin.com/)
- 외부 맥락(시리즈 C $265M): [China Daily](https://www.chinadaily.com.cn/a/202011/27/WS5fc0c70da31024ad0ba980c1.html) · [EdTechReview](https://www.edtechreview.in/news/chinese-saas-edtech-firm-eeo-raises-265m-in-series-c-round-led-by-gl-ventures/) · [CB Insights](https://www.cbinsights.com/company/empower-education-online/financials)
