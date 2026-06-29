export interface AdminListPaginationOptions {
  currentPage: number
  pageSize: number
}

export interface AdminListPaginationResult<T> {
  currentPage: number
  pageSize: number
  totalItems: number
  totalPages: number
  startDisplayNumber: number
  endDisplayNumber: number
  pageItems: T[]
}

function positiveInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  const integer = Math.floor(value)
  return integer > 0 ? integer : fallback
}

export function paginateAdminList<T>(
  items: readonly T[],
  options: AdminListPaginationOptions,
): AdminListPaginationResult<T> {
  const pageSize = positiveInteger(options.pageSize, 1)
  const totalItems = items.length
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize)
  const currentPage = Math.min(positiveInteger(options.currentPage, 1), Math.max(1, totalPages))

  if (totalItems === 0) {
    return {
      currentPage,
      pageSize,
      totalItems,
      totalPages,
      startDisplayNumber: 0,
      endDisplayNumber: 0,
      pageItems: [],
    }
  }

  const startIndex = (currentPage - 1) * pageSize
  const pageItems = items.slice(startIndex, startIndex + pageSize)

  return {
    currentPage,
    pageSize,
    totalItems,
    totalPages,
    startDisplayNumber: startIndex + 1,
    endDisplayNumber: startIndex + pageItems.length,
    pageItems,
  }
}
