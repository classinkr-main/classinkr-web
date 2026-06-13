import Link from "next/link"

import { LegalArticle, LegalList, LegalNotice, LegalSection } from "@/components/legal/LegalArticle"
import { createPublicMetadata } from "@/lib/seo"

export const metadata = createPublicMetadata({
  title: "개인정보처리방침",
  description:
    "Classin 웹사이트와 도입 상담, 뉴스레터, Meta 연동 과정에서 처리되는 개인정보 항목, 이용 목적, 보관 기간, 삭제 요청 방법을 안내합니다. ClassIn 소프트웨어에서 처리되는 개인정보는 글로벌 운영사 EEO의 개인정보처리방침을 함께 따릅니다.",
  path: "/privacy",
})

export default function PrivacyPage() {
  return (
    <LegalArticle
      eyebrow="Privacy Policy"
      title="개인정보처리방침"
      description="이이오클래스인코리아 유한회사는 Classin 웹사이트와 상담, 계약, 마케팅, 고객지원 과정에서 필요한 최소한의 개인정보를 처리하며, 관련 법령과 내부 보호 기준에 따라 안전하게 관리합니다."
      lastUpdated="2026년 6월 14일"
    >
      <LegalNotice>
        ClassIn 소프트웨어(앱) 자체에서 처리되는 개인정보는 글로벌 운영사 EEO의{" "}
        <a
          href="https://www.classin.com/agreement/?type=privacy"
          target="_blank"
          rel="noreferrer"
          className="font-semibold underline underline-offset-4"
        >
          ClassIn 개인정보처리방침(글로벌)
        </a>
        을 함께 따릅니다. Meta 앱 심사와 관련된 데이터 삭제 요청 안내는{" "}
        <Link href="/data-deletion" className="font-semibold underline underline-offset-4">
          사용자 데이터 삭제 안내
        </Link>
        에서 확인할 수 있습니다.
      </LegalNotice>

      <LegalSection title="1. 개인정보 처리자">
        <LegalList
          items={[
            "회사명: 이이오클래스인코리아 유한회사",
            "대표자: 구옌",
            "사업자등록번호: 724-88-02403",
            "서비스명: Classin",
            "주소: 서울특별시 양천구 목동동로 233-1, 8층 806호 (목동, 드림타워)",
            "연락처: classinkr@classin.com, 02-6958-8566",
          ]}
        />
      </LegalSection>

      <LegalSection title="2. 처리하는 개인정보 항목">
        <LegalList
          items={[
            "도입 상담 및 문의: 이름, 소속 기관, 연락처, 이메일, 문의 내용, 상담 진행 기록",
            "뉴스레터 및 마케팅 수신 동의: 이메일 주소, 수신 동의 일시, 수신 거부 기록",
            "계약 및 결제: 계약 담당자 정보, 사업자 정보, 견적 및 결제 관련 정보, 세금계산서 발행에 필요한 정보",
            "웹사이트 이용 기록: 접속 로그, 쿠키, 기기 및 브라우저 정보, 페이지 조회 및 전환 이벤트",
            "Meta 연동 또는 광고 API 이용 시: Meta가 제공하는 앱 범위 식별자, 연결된 페이지 또는 광고 자산 정보, 권한 토큰, 이벤트 처리 로그",
          ]}
        />
      </LegalSection>

      <LegalSection title="3. ClassIn 소프트웨어에서 처리되는 정보">
        <p>
          ClassIn 앱과 웹 서비스를 이용하면 글로벌 운영사 EEO가 서비스 제공에 필요한 정보를 처리합니다. 주요
          항목은 다음과 같으며, 구체적인 처리 기준은 EEO의{" "}
          <a
            href="https://www.classin.com/agreement/?type=privacy"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-[#084734] underline underline-offset-4"
          >
            ClassIn 개인정보처리방침(글로벌)
          </a>
          을 따릅니다.
        </p>
        <LegalList
          items={[
            "계정 정보: 휴대폰 번호 등 가입 시 제공한 정보",
            "수업 및 과제 기록, 출결과 학습 활동 정보",
            "수업 중 발생한 메시지 및 채팅 내용",
            "클라우드 드라이브에 저장한 파일과 수업 자료",
            "기기 및 접속 정보, 서비스 이용 과정에서 자동으로 생성되는 로그",
          ]}
        />
      </LegalSection>

      <LegalSection title="4. 이용 목적">
        <LegalList
          items={[
            "도입 상담, 견적 산출, 계약 체결 및 고객 지원",
            "제품 안내, 업데이트 공지, 뉴스레터 발송 및 수신 거부 처리",
            "결제 처리, 세금계산서 발행, 정산 및 분쟁 대응",
            "웹사이트 품질 개선, 보안 점검, 부정 이용 방지",
            "Meta 광고 및 분석 도구 연동, 캠페인 성과 측정, 사용자가 요청한 Meta 관련 기능 제공",
          ]}
        />
      </LegalSection>

      <LegalSection title="5. 보관 기간">
        <p>
          개인정보는 수집 및 이용 목적이 달성되면 지체 없이 파기합니다. 다만 관계 법령에 따라 보관이
          필요한 정보, 분쟁 대응에 필요한 최소 정보, 사용자가 별도로 동의한 정보는 해당 기간 동안 보관할
          수 있습니다. 백업에 보관된 정보는 안전하게 격리한 뒤 삭제가 가능한 시점에 파기합니다.
        </p>
        <LegalList
          items={[
            "상담 및 문의 기록: 마지막 상담일로부터 최대 3년",
            "뉴스레터 구독 정보: 수신 거부 또는 삭제 요청 시까지",
            "계약, 결제, 세무 관련 기록: 관련 법령에서 정한 기간",
            "보안 로그 및 분석 로그: 목적 달성 후 통계화하거나 합리적인 보관 기간 이후 삭제",
            "Meta 플랫폼 데이터: 사용자가 권한을 철회하거나 삭제를 요청하면 법령상 보관이 필요한 경우를 제외하고 삭제 또는 익명화",
          ]}
        />
      </LegalSection>

      <LegalSection title="6. 제3자 도구와 처리 위탁">
        <p>
          서비스 운영을 위해 클라우드 호스팅, 데이터베이스, 이메일, 결제, 분석, 고객 상담 도구를 사용할 수
          있습니다. 주요 도구에는 Vercel, Supabase, Resend, Google Analytics/Tag Manager, Meta Pixel,
          Kakao Pixel, Toss Payments, Channel Talk 등이 포함될 수 있습니다.
        </p>
        <p>
          각 도구는 서비스 제공, 보안, 결제, 통계 분석, 고객 응대 등 필요한 목적 범위 안에서만 사용되며,
          회사는 처리 목적과 보관 범위를 최소화하기 위해 노력합니다.
        </p>
      </LegalSection>

      <LegalSection title="7. 아동의 개인정보">
        <p>
          회사는 만 14세 미만 아동의 개인정보를 원칙적으로 수집하지 않으며, 수집이 필요한 경우 법정대리인의
          동의를 받아 처리합니다. 글로벌 ClassIn 제품은 미성년자(지역에 따라 만 16세 또는 만 13세 미만) 이용 시
          보호자의 동의를 요구하며, 자세한 사항은 EEO의 개인정보처리방침을 따릅니다.
        </p>
      </LegalSection>

      <LegalSection title="8. 쿠키와 분석 기술">
        <p>
          Classin 웹사이트는 접속 통계, 광고 성과 측정, 사용자 경험 개선을 위해 쿠키와 유사 기술을 사용할 수
          있습니다. 사용자는 브라우저 설정에서 쿠키 저장을 제한하거나 삭제할 수 있습니다. 단, 일부 기능은
          정상적으로 동작하지 않을 수 있습니다.
        </p>
      </LegalSection>

      <LegalSection title="9. 정보주체의 권리">
        <p>
          사용자는 자신의 개인정보에 대해 열람, 정정, 삭제, 처리 정지, 동의 철회를 요청할 수 있습니다.
          요청은 이메일 또는 문의 페이지를 통해 접수할 수 있으며, 회사는 본인 확인 후 관련 법령에 따라
          처리합니다.
        </p>
        <LegalList
          items={[
            <span key="email">
              이메일:{" "}
              <a href="mailto:classinkr@classin.com" className="font-semibold text-[#084734] underline underline-offset-4">
                classinkr@classin.com
              </a>
            </span>,
            <span key="contact">
              문의 페이지:{" "}
              <Link href="/contact#contact-form" className="font-semibold text-[#084734] underline underline-offset-4">
                /contact
              </Link>
            </span>,
            <span key="meta">
              Meta 관련 데이터 삭제 요청:{" "}
              <Link href="/data-deletion" className="font-semibold text-[#084734] underline underline-offset-4">
                /data-deletion
              </Link>
            </span>,
          ]}
        />
      </LegalSection>

      <LegalSection title="10. 계정 해지와 데이터 삭제">
        <p>
          ClassIn 개인 계정은 앱 설정의 계정 해지 메뉴에서 직접 삭제할 수 있으며, 기관 계정은 이메일로 삭제를
          요청할 수 있습니다. 계정 삭제는 되돌릴 수 없으며, 수업과 과제 기록, 채팅 내용, 클라우드 드라이브
          데이터 등 관련 정보가 합리적인 기간 안에 함께 삭제됩니다. Meta 연동 데이터와 마케팅 데이터 삭제는{" "}
          <Link href="/data-deletion" className="font-semibold text-[#084734] underline underline-offset-4">
            사용자 데이터 삭제 안내
          </Link>
          를 따릅니다.
        </p>
      </LegalSection>

      <LegalSection title="11. 안전성 확보 조치">
        <p>
          회사는 개인정보 접근 권한 관리, 전송 구간 암호화, 관리자 접근 제한, 로그 점검, 불필요한 정보의
          삭제 또는 익명화 등 개인정보 보호를 위한 합리적인 관리적, 기술적 조치를 적용합니다.
        </p>
      </LegalSection>

      <LegalSection title="12. 방침 변경">
        <p>
          이 개인정보처리방침은 서비스, 법령, 운영 정책 변경에 따라 수정될 수 있습니다. 중요한 변경이 있는
          경우 웹사이트 공지 또는 개별 안내를 통해 알립니다.
        </p>
      </LegalSection>
    </LegalArticle>
  )
}
