"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export type PublicSettings = Record<string, string>;

export function usePublicSettings() {
  return useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: () => apiFetch<PublicSettings>("/api/public/settings"),
    staleTime: 300_000,
  });
}

export function useWhatsAppLink(text?: string) {
  const { data: settings } = usePublicSettings();
  const number = settings?.["whatsapp.number"] ?? "";
  if (!number) return "#";
  const clean = number.replace(/\D/g, "");
  return `https://wa.me/${clean}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
