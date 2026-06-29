import { describe, expect, it } from "vitest"

import { paginateAdminList } from "@/lib/admin-list-pagination"

describe("paginateAdminList", () => {
  const rows = Array.from({ length: 23 }, (_, index) => ({
    id: `hardware-${index + 1}`,
    name: `Hardware ${index + 1}`,
  }))

  it("returns page items with 1-based display numbers", () => {
    const result = paginateAdminList(rows, { currentPage: 2, pageSize: 10 })

    expect(result).toEqual({
      currentPage: 2,
      pageSize: 10,
      totalItems: 23,
      totalPages: 3,
      startDisplayNumber: 11,
      endDisplayNumber: 20,
      pageItems: rows.slice(10, 20),
    })
  })

  it("clamps requested pages before slicing items", () => {
    expect(paginateAdminList(rows, { currentPage: -4, pageSize: 10 })).toMatchObject({
      currentPage: 1,
      startDisplayNumber: 1,
      endDisplayNumber: 10,
      pageItems: rows.slice(0, 10),
    })

    expect(paginateAdminList(rows, { currentPage: 99, pageSize: 10 })).toMatchObject({
      currentPage: 3,
      startDisplayNumber: 21,
      endDisplayNumber: 23,
      pageItems: rows.slice(20, 23),
    })
  })

  it("keeps empty lists displayable without phantom rows", () => {
    expect(paginateAdminList([], { currentPage: 5, pageSize: 10 })).toEqual({
      currentPage: 1,
      pageSize: 10,
      totalItems: 0,
      totalPages: 0,
      startDisplayNumber: 0,
      endDisplayNumber: 0,
      pageItems: [],
    })
  })
})
