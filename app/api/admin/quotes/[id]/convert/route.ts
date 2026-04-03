import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { getQuote, updateQuote } from "@/lib/repositories/quotes";
import { createContract, generateContractNumber } from "@/lib/repositories/contracts";

/**
 * POST /api/admin/quotes/[id]/convert
 * 견적서 → 계약서 원클릭 전환
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = verifyAdmin(req);
  if (err) return err;
  const { id } = await params;

  try {
    const quote = await getQuote(id);
    if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    if (quote.status === "converted") {
      return NextResponse.json({ error: "Already converted" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const contractNumber = await generateContractNumber();

    // 견적서 품목을 계약서 본문 HTML로 변환
    const itemsHtml = quote.items
      .map(
        (item) =>
          `<tr>
            <td>${item.product_name}</td>
            <td>${item.description ?? ""}</td>
            <td style="text-align:right">${item.quantity}</td>
            <td style="text-align:right">${item.unit_price.toLocaleString()}원</td>
            <td style="text-align:right">${item.amount.toLocaleString()}원</td>
          </tr>`
      )
      .join("");

    const contentHtml = `
<h2>${quote.title}</h2>
<p>견적번호: ${quote.quote_number}</p>
<table border="1" cellpadding="6" cellspacing="0" style="width:100%;border-collapse:collapse">
  <thead>
    <tr><th>품목</th><th>설명</th><th>수량</th><th>단가</th><th>금액</th></tr>
  </thead>
  <tbody>${itemsHtml}</tbody>
  <tfoot>
    <tr><td colspan="4" style="text-align:right"><strong>합계</strong></td><td style="text-align:right"><strong>${quote.total_amount.toLocaleString()}원</strong></td></tr>
  </tfoot>
</table>
${body.additional_terms ? `<h3>특약사항</h3><p>${body.additional_terms}</p>` : ""}
<p>계약 당사자는 위 내용에 동의하며 서명합니다.</p>
`;

    const contract = await createContract({
      contract_number: contractNumber,
      quote_id: quote.id,
      partner_id: quote.partner_id,
      title: body.title ?? quote.title,
      status: "draft",
      total_amount: quote.total_amount,
      content_html: contentHtml,
      valid_from: body.valid_from ?? null,
      valid_until: body.valid_until ?? null,
      notes: body.notes ?? null,
      created_by: null,
    });

    // 견적서 상태 → converted
    await updateQuote(id, {
      status: "converted",
      converted_to_contract_id: contract.id,
    });

    return NextResponse.json({ contract }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/admin/quotes/[id]/convert]", e);
    return NextResponse.json({ error: "Failed to convert quote" }, { status: 500 });
  }
}
