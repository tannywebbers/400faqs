"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { whatsappLink } from "@/lib/utils";

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
  const result = whatsappLink(settings?.["whatsapp.number"] ?? "", text);
  return result;
}
