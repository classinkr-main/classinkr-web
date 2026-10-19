import { describe, expect, it } from "vitest"

import { parseXiaoshouyiQueryRecords } from "@/lib/external-crm/query-response"

describe("Xiaoshouyi query snapshot response", () => {
  const rows = [{ id: "123", amount: -250 }, { id: 124, amount: 0 }]

  it.each([
    { records: rows },
    { result: { records: rows } },
    { code: 200, result: { records: rows }, data: {} },
    { code: 200, data: { records: rows } },
    { code: "200", data: { result: { records: rows } } },
  ])("accepts observed successful record envelopes without changing signed amounts", (payload) => {
    expect(parseXiaoshouyiQueryRecords(payload, "opportunity")).toEqual(rows)
  })

  it.each([{ records: [] }, { code: 200, data: { records: [] } }])("accepts an explicit empty complete snapshot", (payload) => {
    expect(parseXiaoshouyiQueryRecords(payload, "opportunity")).toEqual([])
  })

  it("rejects an HTTP 200 business error before it can be mistaken for a deleted snapshot", () => {
    expect(() => parseXiaoshouyiQueryRecords({ code: 2040004, msg: "column not exist", data: null }, "CollectionPlan__c"))
      .toThrow("API 2040004")
  })

  it.each([null, {}, { code: 200, data: null }, { records: null }, { records: "invalid" }])("rejects missing or malformed record lists", (payload) => {
    expect(() => parseXiaoshouyiQueryRecords(payload, "account")).toThrow()
  })

  it.each([null, [], "invalid", {}, { id: "" }, { id: null }, { id: Number.NaN }])("rejects an invalid row rather than silently dropping it", (record) => {
    expect(() => parseXiaoshouyiQueryRecords({ records: [{ id: "valid" }, record] }, "account")).toThrow()
  })
})
