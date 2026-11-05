import { useState, type ReactNode } from 'react';
import { TablePagination } from './table-pagination';
export function useClientPagination<T>(allRows: T[]) {
  const [requestedPage, setPage] = useState(1), [pageSize, setPageSize] = useState(10);
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(allRows.length / pageSize)));
  return { rows: allRows.slice((page - 1) * pageSize, page * pageSize), total: allRows.length, page, pageSize, onPage: setPage, onPageSize: (size: number) => { setPageSize(size); setPage(1); } };
}
export function ClientTablePagination({ pagination, disabled, loading, countLabel }: { countLabel?: ReactNode; pagination: Omit<ReturnType<typeof useClientPagination>, 'rows'>; disabled?: boolean;loading?:boolean }) { return <TablePagination {...pagination} countLabel={countLabel} loading={loading} disabled={disabled} />; }
