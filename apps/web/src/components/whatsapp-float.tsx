"use client";

import { MessageCircle } from "lucide-react";
import { useWhatsAppLink } from "@/hooks/use-public-settings";

export function WhatsAppFloat() {
  const href = useWhatsAppLink("START");

  if (!href || href === "#") return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Start playing on WhatsApp"
      className="group fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 shadow-glass-lg transition-all hover:scale-[1.04] hover:bg-[#1eb857] active:scale-[0.98]"
    >
      <MessageCircle className="h-6 w-6 text-white" fill="currentColor" />
      <span className="hidden pr-1 text-sm font-semibold text-white sm:inline">Start on WhatsApp</span>
    </a>
  );
}