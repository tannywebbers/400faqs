"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPublicSettings, type PublicSettings } from "@/lib/queries/public-client";
import { whatsappLink } from "@/lib/utils";

export type { PublicSettings };

export function usePublicSettings() {
  return useQuery<PublicSettings>({
    queryKey: ["public-settings"],
    queryFn: () => fetchPublicSettings(),
    staleTime: 300_000,
  });
}

export function useWhatsAppLink(text?: string) {
  const { data: settings } = usePublicSettings();
  const result = whatsappLink(settings?.["whatsapp.number"] ?? "", text);
  return result;
}
