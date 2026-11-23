# 심사관 C 지시문

답 색인 사양 §2.4 3단계: "A와 B가 다르면 심사관 C가 두 근거를 보고 정한다." 이 파일 전체를 심사관 C 에이전트(A·B 와 다른 에이전트)에게 그대로 준다. 배치마다 입력 파일 경로(`X.Cin.json`)와 결과 파일 경로(`X.C.json`)만 바꿔 알려 준다. C 입력은 `judge.ts disagreements`가 만든다. 입력 줄이 0개면 C 단계는 없다. 개발용·확정용에 같은 지시문, 같은 모델 등급을 쓴다.

## 지시

> 당신은 ClassIn 한국 홈페이지 챗봇의 첫 답변을 엄격하게 분류하는 심사관 C입니다. 아래 줄들은 심사관 A 와 B 의 분류가 달랐던 줄입니다. 두 심사관의 분류와 근거를 함께 드립니다. `scripts/chatbot-persona-loop/rubric.md`의 사실 확인 문서 목록과 금지 사항을 먼저 읽으세요. `lib/chatbot/` 구현 코드와 `data/answer-index/`는 읽지 마세요.
> 줄마다 두 근거를 공개 문서에서 직접 확인한 뒤 최종 분류 하나를 고릅니다: `good`·`partial`·`nf_ok`·`wrong`·`nf_doc_has`·`needless_clarify`(정의는 아래 표 그대로). 근거를 더 잘 댄 쪽을 따르되, 두 판정이 모두 틀렸으면 표에 맞는 다른 분류를 고릅니다. 인용이 문서에 실제로 있는지, 찾아본 낱말이 충분한지 확인하세요. `nf_ok`면 찾아본 낱말 3개 이상과 본 문서 경로를, `nf_doc_has`·`wrong`이면 근거 문장(경로 + 인용)을 적습니다. 너그럽게 보지 말고, 문서에 없는 사실이 있는지와 문서에 있는 내용을 없다고 하지 않는지 직접 찾으세요.
> 출력: `{"judge":"C","results":[{"id","verdict","evidence":[{"path","quote"}],"searched":[],"note"}]}`. 파일을 쓴 뒤 JSON 파싱과 행 수를 확인하세요.

## 분류 정의(사양 §2.1 표 그대로)

점수 = (좋은 답 + 정직한 못 찾음 + 0.5 × 일부만 답함) ÷ 전체 × 100.

| 분류 | 정의(심사관에게 그대로 준다) | 점수 |
|---|---|---|
| `good` 좋은 답 | 질문의 의도에 맞는 주제이고(rubric C1=2), 답의 사실이 공개 문서와 맞으며(C2=2), 안전·정책을 어기지 않고(C5=2), 물은 것을 다 답한다(예/아니오를 물었으면 답이 그 답을 알 수 있게 한다, 방법을 물었으면 경로가 있다) | 1 |
| `partial` 일부만 답함 | 주제와 사실은 맞지만 물은 것의 일부만 답한다(두 가지 중 하나, 방법을 물었는데 경로 없음, 가능 여부를 물었는데 알 수 없음, 질문과 상관없는 단계가 많음) | 0.5 |
| `nf_ok` 정직한 못 찾음 | 못 찾았다거나 상담으로 넘기는 답이고, 공개 문서에 정말 답이 없다. 심사관은 찾아본 낱말 3개 이상과 본 문서를 적는다 | 1 |
| `wrong` 엉뚱한 답 | 다른 주제, 틀린 사실, 문서에 없는 기능·가격·정책 단정, 안전 위반(식별 정보 요구, 가격·환불 약속) | 0 |
| `nf_doc_has` 문서에 있는데 못 찾음 | 못 찾음·상담 넘김인데 공개 문서에 답이 있다. 심사관은 근거 문장(경로 + 인용)을 적는다 | 0 |
| `needless_clarify` 불필요한 되묻기 | 무엇을 묻는지 분명한데 되묻는다 | 0 |

- 사실 확인 범위는 `rubric.md`가 정한 공개 문서다. 공개 페이지(개인정보처리방침·약관·푸터)를 넣을지는 사람이 아직 정하지 않았다. 정해지기 전까지 분류는 rubric 범위로 하고, 공개 페이지 사실에 기댄 답은 따로 표시해 두 방식의 점수를 함께 적는다(아래 `siteVerdict`).

## 진행 방법

1. `scripts/chatbot-persona-loop/rubric.md`를 읽는다. 쓰는 것은 '사실 확인용 공개 문서' 목록과 '읽지 말 것', C5(안전·정책)의 금지 사항이다. rubric 의 점수 항목 합계·통과 규칙·출력 형식은 이 심사에서 쓰지 않는다.
   - 공개 문서: `lib/docs.ts`(`status`가 `review`·`draft`인 문서는 제외), `lib/docs-troubleshooting/*.ts`, `lib/cs-figma-guides.ts`와 그 파일이 내보내는 생성 가이드(`INTERNAL_ONLY_CS_FIGMA_DOC_SLUGS`에 든 slug 는 제외), `lib/classin-positioning.ts`.
   - 공개 페이지(`siteVerdict`를 정할 때만 본다): `app/privacy/page.tsx`(현재판), `app/terms`, `app/data-deletion`, `app/about`, `app/introduction`, 문의 페이지, 푸터 컴포넌트.
2. 입력 파일(`X.Cin.json`)의 `rows[]`를 읽는다. 줄마다 `id`, `question`, `answer`, `sources`와 `judgments`(심사관 A·B 각각의 `verdict`·`evidence`·`searched`·`note`, 있으면 `siteVerdict`)가 있다. 입력 밖의 다른 파일(`X.A.json`·`X.B.json`·`X.final.json`)은 열지 않는다.
3. 두 판정의 인용을 문서에서 찾아 실제로 있는지, 그 문장이 질문에 답하는지 확인한다. `nf_ok` 쪽 판정이면 그 낱말 말고도 낱말을 바꿔 다시 찾는다.
4. 최종 분류를 고른다. A·B 가 `siteVerdict`만 달랐던 줄은 `verdict`는 그대로 두고 `siteVerdict`만 정한다.
5. 결과 파일(`X.C.json`)을 쓰고 아래 확인 명령을 돌린다. 오류가 나오면 고쳐서 다시 돌린다. 통과해야 끝난다.

```bash
npx tsx scripts/answer-index/judge/judge.ts check <X.C.json>
```

## 결과 파일 형식

심사관 A·B 와 같은 형식이다. `judge`만 `"C"`이고, 근거는 C 가 직접 확인한 것을 적는다(A·B 의 근거를 옮길 때도 문서에서 확인한 뒤 옮긴다).

```json
{
  "judge": "C",
  "results": [
    {
      "id": "dev5-owner-small-17",
      "verdict": "nf_doc_has",
      "evidence": [{ "path": "/docs/<분류>/<문서>", "quote": "<문서 문장을 고치지 않고 그대로 옮김>" }],
      "searched": ["과제 제출", "숙제 내기"],
      "note": "B 의 인용이 문서에 있고 질문에 답함. A 는 다른 문서만 찾아봄"
    }
  ]
}
```

| 필드 | 규칙 |
|---|---|
| `judge` | `"C"` |
| `results` | 입력 `rows[]`의 모든 `id`가 한 번씩 |
| `verdict` | `good`·`partial`·`nf_ok`·`wrong`·`nf_doc_has`·`needless_clarify` 중 하나 |
| `evidence[]` | `{ "path", "quote" }`. `quote`는 문서 문장을 고치지 않고 그대로 옮긴다 |
| `searched[]` | 찾아본 낱말 |
| `note` | 어느 판정을 왜 따랐는지 한두 문장 |
| `siteVerdict` | (있을 때만) 공개 페이지까지 근거로 칠 때의 분류 |

필수 근거(확인 명령이 막는다): `nf_ok`는 `searched` 3개 이상과 본 문서 `path` 1개 이상, `nf_doc_has`·`wrong`은 `path`와 `quote`가 모두 있는 항목 1개 이상.

마지막 답장에는 분류별 개수와 A·B 가운데 어느 쪽을 몇 번 따랐는지만 짧게 적는다.
