import Link from "next/link"

import { LegalArticle, LegalList, LegalNotice, LegalSection } from "@/components/legal/LegalArticle"
import { createPublicMetadata } from "@/lib/seo"

export const metadata = createPublicMetadata({
  title: "이용약관",
  description: "Classin 웹사이트와 도입 서비스 이용약관입니다. ClassIn 소프트웨어 자체의 이용은 글로벌 운영사 EEO의 ClassIn 이용약관을 함께 따릅니다.",
  path: "/terms",
})

export default function TermsPage() {
  return (
    <LegalArticle
      eyebrow="Terms of Service"
      title="이용약관"
      description="이 약관은 이이오클래스인코리아 유한회사가 운영하는 Classin 웹사이트와 도입 상담, 견적, 계약, 고객지원 서비스 이용에 관한 기본 조건을 정합니다. ClassIn 소프트웨어(앱) 자체의 계정과 이용에는 글로벌 운영사 EEO의 ClassIn 이용약관이 함께 적용됩니다."
      lastUpdated="2026년 6월 14일"
    >
      <LegalNotice>
        본 약관은 한국 법인 이이오클래스인코리아 유한회사가 운영하는 웹사이트와 도입 서비스에 적용됩니다. ClassIn
        소프트웨어(온라인 교실 앱) 자체의 계정과 이용에는 글로벌 운영사 EEO가 정한{" "}
        <a
          href="https://www.classin.com/agreement/?type=user"
          target="_blank"
          rel="noreferrer"
          className="font-semibold underline underline-offset-4"
        >
          ClassIn 이용약관(글로벌)
        </a>
        이 함께 적용됩니다.
      </LegalNotice>

      <LegalSection title="1. 목적과 적용">
        <p>
          본 약관은 Classin 웹사이트, 도입 상담, 견적, 계약, 고객지원, 마케팅 정보 제공 등 회사가 제공하는
          서비스 이용에 적용됩니다. ClassIn 소프트웨어 자체의 계정과 기능 이용은 글로벌 운영사 EEO의 ClassIn
          이용약관을 함께 따릅니다. 별도 계약서 또는 주문서가 있는 경우 해당 문서가 본 약관보다 우선합니다.
        </p>
      </LegalSection>

      <LegalSection title="2. 운영 주체와 용어">
        <LegalList
          items={[
            "회사: 이이오클래스인코리아 유한회사를 말하며, Classin 웹사이트와 한국 내 도입 상담, 계약, 고객지원을 운영합니다.",
            "EEO: 글로벌 ClassIn 소프트웨어(웹, 모바일, 데스크톱 애플리케이션)의 계정과 서비스를 제공하는 운영사를 말합니다.",
            "서비스: 회사가 제공하는 웹사이트 및 도입 서비스와 EEO가 제공하는 ClassIn 소프트웨어를 통칭합니다.",
          ]}
        />
      </LegalSection>

      <LegalSection title="3. 서비스의 내용">
        <p>회사가 제공하는 서비스</p>
        <LegalList
          items={[
            "학원 운영 및 교육 품질 관리를 위한 소프트웨어와 관련 안내",
            "하드웨어, 설치, 교육, 운영 지원에 관한 상담 및 견적",
            "고객 지원, 문서, 업데이트, 뉴스레터 및 마케팅 정보 제공",
            "Meta 광고 또는 분석 도구 등 외부 플랫폼과의 연동 지원",
          ]}
        />
        <p>EEO가 제공하는 ClassIn 소프트웨어 기능</p>
        <LegalList
          items={[
            "온라인 교실(실시간 화상 수업)과 수업 운영 도구",
            "과제 제출 및 관리",
            "메시지, 채팅, 친구 추가 및 관리",
            "클라우드 드라이브를 통한 수업 자료 저장과 공유",
          ]}
        />
      </LegalSection>

      <LegalSection title="4. 계정">
        <LegalList
          items={[
            "ClassIn 계정은 휴대폰 번호 등으로 등록하며, 미성년자는 법정대리인의 동의 또는 등록을 통해 이용합니다.",
            "ClassIn 계정의 소유권은 EEO에 있으며, 이용자는 약관에 따른 이용 권한을 가집니다.",
            "이용자는 계정 정보를 정확하고 최신으로 유지하고, 비밀번호 등 인증 정보를 안전하게 관리할 책임이 있습니다.",
          ]}
        />
      </LegalSection>

      <LegalSection title="5. 이용자의 의무">
        <LegalList
          items={[
            "정확하고 최신의 정보를 제공해야 합니다.",
            "타인의 권리, 개인정보, 영업비밀을 침해하는 방식으로 서비스를 이용할 수 없습니다.",
            "서비스의 보안, 운영, 정상적인 이용을 방해하는 행위를 할 수 없습니다.",
            "외부 플랫폼을 연동하는 경우 해당 플랫폼의 약관과 정책을 함께 준수해야 합니다.",
          ]}
        />
      </LegalSection>

      <LegalSection title="6. 금지 행위">
        <LegalList
          items={[
            "불법, 음란, 명예훼손, 타인의 지식재산권이나 개인정보를 침해하는 콘텐츠를 업로드하거나 전송하는 행위",
            "자동화 도구(봇, 크롤러) 사용, 허위 계정 생성, 대량 등록 등 부정한 방법으로 서비스를 이용하는 행위",
            "무단 접근, 해킹, 보안 취약점 악용, 네트워크 공격 등 서비스 운영을 방해하는 행위",
            "회사 또는 EEO의 사전 동의 없이 서비스를 복제, 재판매, 재배포하거나 상업적으로 이용하는 행위",
          ]}
        />
      </LegalSection>

      <LegalSection title="7. 요금, 결제, 환불">
        <p>
          유료 서비스의 금액, 결제 방식, 제공 범위, 환불 조건은 견적서, 계약서, 주문서, 결제 화면 또는 별도
          안내에 따릅니다. 외부 결제사가 처리하는 결제 정보는 해당 결제사의 정책과 법령에 따라 보관될 수
          있습니다.
        </p>
      </LegalSection>

      <LegalSection title="8. 지식재산권">
        <p>
          Classin 웹사이트, 문서, 디자인, 소프트웨어, 로고, 콘텐츠에 관한 권리는 회사, EEO 또는 정당한 권리자에게
          있습니다. 이용자는 사전 동의 없이 이를 복제, 배포, 판매, 변형하거나 상업적으로 이용할 수 없습니다.
        </p>
      </LegalSection>

      <LegalSection title="9. 개인정보 보호">
        <p>
          회사는 개인정보를{" "}
          <Link href="/privacy" className="font-semibold text-[#084734] underline underline-offset-4">
            개인정보처리방침
          </Link>
          에 따라 처리합니다. Meta 연동 또는 외부 플랫폼 데이터 삭제 요청은{" "}
          <Link href="/data-deletion" className="font-semibold text-[#084734] underline underline-offset-4">
            사용자 데이터 삭제 안내
          </Link>
          를 따릅니다. ClassIn 소프트웨어에서 처리되는 개인정보는 EEO의{" "}
          <a
            href="https://www.classin.com/agreement/?type=privacy"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-[#084734] underline underline-offset-4"
          >
            ClassIn 개인정보처리방침(글로벌)
          </a>
          을 함께 따릅니다.
        </p>
      </LegalSection>

      <LegalSection title="10. 서비스 변경과 중단">
        <p>
          회사는 운영상, 기술상 필요에 따라 서비스의 전부 또는 일부를 변경하거나 중단할 수 있습니다. 중요한
          변경이 사용자의 권리와 의무에 영향을 주는 경우 합리적인 방법으로 사전 또는 사후에 안내합니다.
        </p>
      </LegalSection>

      <LegalSection title="11. 책임의 제한">
        <p>
          회사와 EEO는 천재지변, 외부 플랫폼 장애, 통신망 장애, 시스템 취약점, 제3자의 행위, 이용자의 귀책 사유
          등 합리적 통제를 벗어난 사유로 인한 손해에 대해 책임을 지지 않습니다. 책임 범위는 관계 법령과 개별
          계약에서 정한 범위에 따릅니다.
        </p>
      </LegalSection>

      <LegalSection title="12. 준거법과 분쟁 해결">
        <LegalList
          items={[
            "회사가 제공하는 웹사이트 및 한국 내 도입 서비스에 관한 분쟁은 대한민국 법령을 준거법으로 하며, 관할은 민사소송법에 따른 법원으로 합니다.",
            <span key="global">
              ClassIn 소프트웨어 계정과 글로벌 서비스 이용에 관한 사항은 EEO의{" "}
              <a
                href="https://www.classin.com/agreement/?type=user"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-[#084734] underline underline-offset-4"
              >
                ClassIn 이용약관(글로벌)
              </a>
              에 따르며, 해당 약관은 싱가포르 법을 준거법으로 하고 분쟁을 싱가포르국제중재센터(SIAC) 중재로
              해결하도록 정하고 있습니다.
            </span>,
          ]}
        />
      </LegalSection>

      <LegalSection title="13. 문의">
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
          ]}
        />
      </LegalSection>
    </LegalArticle>
  )
}
