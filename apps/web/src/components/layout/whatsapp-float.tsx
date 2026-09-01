"use client";

import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { usePublicSettings } from "@/hooks/use-public-settings";
import { whatsappLink } from "@/lib/utils";

export function WhatsAppFloat() {
  const { data: settings } = usePublicSettings();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const enabled = settings?.["whatsapp.widget.enabled"] !== "false";
  const number = settings?.["whatsapp.number"] ?? "";
  const bubble = settings?.["whatsapp.widget.bubble"] ||
    (settings?.["whatsapp.displayName"] ? settings["whatsapp.displayName"] : "Chat on WhatsApp");
  const link = whatsappLink(number, "Hi! I'd like to play 400faqs 🎮");

  if (!mounted || !enabled || !number) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-3">
      {open && (
        <div className="w-64 rounded-2xl border border-line bg-white p-4 shadow-xl">
          <p className="mb-3 text-sm font-semibold text-ink">{bubble}</p>
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-control bg-primary px-4 py-2 text-sm font-medium text-white shadow-soft transition-all hover:bg-primary-600 active:scale-[0.98]"
          >
            <MessageCircle className="h-4 w-4" /> Open WhatsApp
          </a>
        </div>
      )}
      <button
        type="button"
        aria-label={open ? "Close WhatsApp chat" : "Chat on WhatsApp"}
        onClick={() => setOpen((v) => !v)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-xl transition-transform hover:scale-105 active:scale-95"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-7 w-7" />}
      </button>
    </div>
  );
}
