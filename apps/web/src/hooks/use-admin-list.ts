"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useDebounce } from "@/hooks/use-debounce";

export type AdminListResult<T> = {
  data: T[];
  page: number;
  total: number;
  totalPages: number;
};

export function useAdminList<T>({
  queryFn,
  queryKey,
  limit = 20,
  enabled = true,
}: {
  queryFn: (params: { page: number; limit: number; q: string; status: string }) => Promise<AdminListResult<T>>;
  queryKey: string;
  limit?: number;
  enabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [page, setPage] = useState(1);
  const debounced = useDebounce(q, 400);

  const query = useQuery<AdminListResult<T>>({
    queryKey: [queryKey, debounced, status, page],
    queryFn: () => queryFn({ page, limit, q: debounced, status }),
    placeholderData: (prev) => prev,
    enabled,
  });

  const reset = () => {
    setQ("");
    setStatus("");
    setPage(1);
  };

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: query.refetch,
    q,
    setQ: (v: string) => {
      setQ(v);
      setPage(1);
    },
    status,
    setStatus: (v: string) => {
      setStatus(v);
      setPage(1);
    },
    page,
    setPage,
    reset,
  };
}
