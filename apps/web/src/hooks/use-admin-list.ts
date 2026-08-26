"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch, getToken } from "@/lib/api";
import { useDebounce } from "@/hooks/use-debounce";

export type AdminListResult<T> = {
  data: T[];
  page: number;
  total: number;
  totalPages: number;
};

export function useAdminList<T>({
  path,
  limit = 20,
  enabled = true,
}: {
  path: string;
  limit?: number;
  enabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [page, setPage] = useState(1);
  const debounced = useDebounce(q, 400);
  const token = getToken();

  const query = useQuery<AdminListResult<T>>({
    queryKey: [path, debounced, status, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (debounced) params.set("q", debounced);
      if (status) params.set("status", status);
      return apiFetch(`${path}?${params.toString()}`, { token });
    },
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
