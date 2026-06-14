import Link from "next/link"

import { LegalArticle, LegalList, LegalNotice, LegalSection } from "@/components/legal/LegalArticle"
import { createPublicMetadata } from "@/lib/seo"

export const metadata = createPublicMetadata({
  title: "사용자 데이터 삭제 안내",
  description:
    "ClassIn 계정 삭제 방법과 Meta 앱·Classin 서비스에서 처리된 사용자 데이터의 연결 해제 및 삭제 요청 절차를 안내합니다.",
  path: "/data-deletion",
})

export default function DataDeletionPage() {
  return (
    <LegalArticle
      eyebrow="User Data Deletion"
      title="사용자 데이터 삭제 안내"
      description="이 페이지는 ClassIn 계정 삭제 방법과, Meta 앱 대시보드의 사용자 데이터 삭제 안내 URL로 사용할 수 있는 공개 안내문을 제공합니다. Classin과 연결된 Meta 권한을 철회하거나, Classin이 보관 중인 관련 데이터 삭제를 요청하는 절차를 설명합니다."
      lastUpdated="2026년 6월 14일"
    >
      <LegalNotice>
        Meta App Dashboard의 사용자 데이터 삭제 항목에는{" "}
        <strong>https://classin.ai.kr/data-deletion</strong> 을 입력해 주세요. 자동 콜백 URL이 아니라
        “데이터 삭제 안내 URL” 옵션에 사용할 수 있는 안내 페이지입니다.
      </LegalNotice>

      <LegalSection title="1. 적용 범위">
        <p>
          이 안내는 두 가지 경로를 다룹니다. ① ClassIn 소프트웨어(앱)에서 만든 계정과 관련 데이터의 삭제,
          ② Classin 웹사이트와 상담, 마케팅, Meta 광고 또는 API 연동 과정에서 Classin이 처리한 사용자 데이터의
          삭제입니다. Meta 앱 표시 이름이 <strong>classin-mt-ads</strong> 등으로 보이는 경우에도 Classin 관련
          앱이면 이 절차를 사용할 수 있습니다.
        </p>
      </LegalSection>

      <LegalSection title="2. ClassIn 계정과 데이터 삭제">
        <p>
          ClassIn 소프트웨어 계정과 그 안에 저장된 데이터는 글로벌 운영사 EEO가 관리합니다. 계정 삭제는
          되돌릴 수 없으며, 수업과 과제 기록, 채팅 내용, 클라우드 드라이브 데이터 등이 합리적인 기간 안에 함께
          삭제됩니다.
        </p>
        <LegalList
          items={[
            "개인 계정: ClassIn 앱 설정에서 계정 해지(계정 삭제) 메뉴를 통해 직접 요청할 수 있습니다.",
            "기관 계정: 기관 관리자가 이메일로 삭제를 요청할 수 있습니다.",
          ]}
        />
        <p>
          ClassIn 제품의 개인정보 처리와 삭제 기준은 EEO의{" "}
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
      </LegalSection>

      <LegalSection title="3. Meta 계정에서 Classin 연결 해제">
        <LegalList
          items={[
            "Facebook 또는 Instagram에서 설정 및 개인정보 메뉴로 이동합니다.",
            "앱 및 웹사이트, 비즈니스 통합, 또는 연결된 앱 목록에서 Classin 관련 앱을 찾습니다.",
            "앱을 제거하거나 접근 권한을 해제합니다.",
            "가능한 경우 Meta 화면에서 앱 데이터 삭제 요청 옵션을 선택합니다.",
          ]}
        />
        <p>
          Meta 화면 구성은 계정 유형, 지역, 제품에 따라 다를 수 있습니다. 앱 목록에서 Classin을 찾기 어렵다면
          아래 이메일 절차로 바로 요청할 수 있습니다.
        </p>
      </LegalSection>

      <LegalSection title="4. Classin에 삭제 요청하기">
        <p>
          Classin이 보관 중인 Meta 연동 데이터 또는 상담 데이터를 삭제하려면 아래 주소로 이메일을 보내주세요.
          본인 확인과 대상 데이터 식별을 위해 필요한 최소 정보만 요청합니다.
        </p>
        <LegalList
          items={[
            <span key="email">
              수신 주소:{" "}
              <a href="mailto:classinkr@classin.com" className="font-semibold text-[#084734] underline underline-offset-4">
                classinkr@classin.com
              </a>
            </span>,
            "메일 제목: Meta 데이터 삭제 요청",
            "포함 정보: 이름, 연락 가능한 이메일, 연결된 Facebook/Instagram 계정 또는 페이지 정보, 앱 범위 사용자 ID가 있는 경우 해당 ID",
            "사업체 또는 광고 계정과 연결된 요청이라면 관련 비즈니스 이름이나 광고 계정 식별 정보를 함께 적어주세요.",
          ]}
        />
      </LegalSection>

      <LegalSection title="5. 삭제되는 데이터">
        <LegalList
          items={[
            "Meta에서 제공된 앱 범위 사용자 식별자와 연결 정보",
            "Classin 서비스에 저장된 Meta 접근 토큰 또는 권한 연결 기록",
            "사용자가 연결한 페이지, 광고 자산, 비즈니스 자산과 관련된 연동 메타데이터",
            "삭제 요청 대상과 직접 연결된 상담, 마케팅, 지원 기록 중 보관 의무가 없는 정보",
          ]}
        />
        <p>
          법령상 보관이 필요한 계약, 결제, 세무, 보안 로그는 즉시 삭제되지 않을 수 있습니다. 이 경우 법적
          보관 목적에 필요한 범위로 접근을 제한하고, 보관 기간이 끝나면 삭제 또는 익명화합니다.
        </p>
      </LegalSection>

      <LegalSection title="6. 처리 기한과 결과 안내">
        <p>
          삭제 요청은 접수 후 합리적으로 가능한 빠른 시일 내에 처리하며, 일반적으로 30일 이내에 결과를
          안내합니다. 요청 범위가 복잡하거나 추가 확인이 필요한 경우 진행 상황과 예상 일정을 알려드립니다.
        </p>
      </LegalSection>

      <LegalSection title="7. 개인정보처리방침">
        <p>
          Classin의 개인정보 처리 기준, 보관 기간, 제3자 도구 사용 내역은{" "}
          <Link href="/privacy" className="font-semibold text-[#084734] underline underline-offset-4">
            개인정보처리방침
          </Link>
          에서 확인할 수 있습니다. ClassIn 소프트웨어 자체의 개인정보 처리는 EEO의{" "}
          <a
            href="https://www.classin.com/agreement/?type=privacy"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-[#084734] underline underline-offset-4"
          >
            ClassIn 개인정보처리방침(글로벌)
          </a>
          을 함께 확인해 주세요.
        </p>
      </LegalSection>
    </LegalArticle>
  )
}
