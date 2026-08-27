"use client";

import { useState } from "react";
import { MessageCircle, RefreshCw } from "lucide-react";
import { usePhone } from "@/hooks/use-phone";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function PhoneGate({ children }: { children: React.ReactNode }) {
  const { phone, setPhone } = usePhone();
  const [draft, setDraft] = useState("");

  if (phone) return <>{children}</>;

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-line bg-white p-6 text-center shadow-soft">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10 text-brand">
        <MessageCircle className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">Enter your WhatsApp number</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        We use it so you can track your contributions, reports and category requests. It stays on your device.
      </p>
      <div className="mt-5 space-y-2 text-left">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. 14155552671"
          inputMode="tel"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") setPhone(draft);
          }}
        />
        <Button className="w-full" onClick={() => setPhone(draft)} disabled={draft.trim().length < 8}>
          Continue
        </Button>
        <p className="text-center text-xs text-muted-foreground">Include your country code. No password needed.</p>
      </div>
    </div>
  );
}

export function PhoneBar() {
  const { phone, clearPhone } = usePhone();
  if (!phone) return null;
  return (
    <div className="mb-6 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-muted-foreground">
          <MessageCircle className="h-4 w-4 text-brand" />
          Signed in as <strong className="font-mono text-ink">{phone}</strong>
        </span>
        <button onClick={clearPhone} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
          <RefreshCw className="h-3 w-3" /> Change
        </button>
      </div>
    </div>
  );
}