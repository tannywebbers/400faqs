"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Timer, Copy, Check, ExternalLink, ShieldCheck, XCircle, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Container } from "@/components/layout/container";

type GateStatusData = {
  status: "valid" | "verified" | "expired" | "invalid" | "failed" | "cancelled";
  remainingMs?: number;
  countdownSeconds?: number;
  codeAvailable?: boolean;
};

type PageSnippet = { id: string; name: string; type: string; content: string | null; placement: string };

type MonetizeData = {
  status: GateStatusData;
  ads: { snippets: PageSnippet[]; directLink: string | null; directLinkEnabled: boolean };
};

function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function MonetizePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const query = useQuery<MonetizeData>({
    queryKey: ["monetize", token],
    queryFn: () => apiFetch(`/api/monetization/${token}`),
    enabled: Boolean(token),
    retry: 1,
  });

  const [remaining, setRemaining] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  const status = query.data?.status;
  const isCounting = status?.status === "valid" && (status.remainingMs ?? 0) > 0;

  useEffect(() => {
    if (status?.status === "valid") {
      const initial = (status.remainingMs ?? 0) / 1000;
      setRemaining(initial);
      const id = setInterval(() => {
        setRemaining((prev) => (prev === null || prev <= 0 ? 0 : prev - 1));
      }, 1000);
      return () => clearInterval(id);
    }
    setRemaining(null);
  }, [status?.status, status?.remainingMs]);

  const codeAvailable = status?.codeAvailable ?? Boolean(code);

  const getCodeMutation = useMutation({
    mutationFn: () => apiFetch<{ code: string }>(`/api/monetization/${token}/code`, { method: "POST" }),
    onSuccess: (data) => {
      setCode(data.code);
      setCodeError(null);
    },
    onError: (err: Error) => {
      setCodeError(err.message);
    },
  });

  function copyCode() {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const dt = query.data;
  const settings = {
    siteName: process.env.NEXT_PUBLIC_SITE_NAME ?? "400QUES",
  };

  return (
    <Container className="py-10">
      <div className="mx-auto flex w-full max-w-md flex-col items-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-brand text-xl font-black text-white">4Q</div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Quick verification</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Complete this one short step to continue playing {settings.siteName} on WhatsApp.
        </p>

        {query.isLoading && (
          <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking your link…
          </div>
        )}

        {query.isError && (
          <div className="mt-8 flex w-full flex-col items-center rounded-2xl border border-line bg-white p-8 text-center shadow-soft">
            <XCircle className="h-10 w-10 text-red-500" />
            <p className="mt-3 font-semibold">This link is not valid</p>
            <p className="mt-1 text-sm text-muted-foreground">Please request a new verification link from your WhatsApp game session.</p>
          </div>
        )}

        {dt && status?.status === "verified" && (
          <div className="mt-8 flex w-full flex-col items-center rounded-2xl border border-green-200 bg-white p-8 text-center shadow-soft">
            <ShieldCheck className="h-10 w-10 text-green-600" />
            <p className="mt-3 text-lg font-bold">Verification complete</p>
            <p className="mt-1 text-sm text-muted-foreground">You&#39;re all set — your game session can continue now. Head back to WhatsApp!</p>
          </div>
        )}

        {dt && (status?.status === "expired" || status?.status === "failed" || status?.status === "cancelled" || status?.status === "invalid") && (
          <div className="mt-8 flex w-full flex-col items-center rounded-2xl border border-red-200 bg-white p-8 text-center shadow-soft">
            <XCircle className="h-10 w-10 text-red-500" />
            <p className="mt-3 font-semibold">
              {status?.status === "expired" && "This link has expired"}
              {status?.status === "failed" && "Too many incorrect attempts"}
              {status?.status === "cancelled" && "This verification is no longer active"}
              {status?.status === "invalid" && "This link is not valid"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Please request a new verification link from your WhatsApp game session.</p>
          </div>
        )}

        {dt && status?.status === "valid" && (
          <div className="mt-8 w-full space-y-4">
            {isCounting && (
              <div className="rounded-2xl border border-line bg-white p-6 text-center shadow-soft">
                <div className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground">
                  <Timer className="h-4 w-4" /> Please wait
                </div>
                <p className="mt-3 font-mono text-5xl font-bold tracking-tight">{formatCountdown(remaining ?? 0)}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Your verification code will be available when the timer ends.
                </p>
              </div>
            )}

            {!isCounting && !code && !codeAvailable && (
              <button
                onClick={() => getCodeMutation.mutate()}
                disabled={getCodeMutation.isPending}
                className="w-full rounded-full bg-gradient-brand px-6 py-4 text-center font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {getCodeMutation.isPending ? "Preparing your code…" : "Get my verification code"}
              </button>
            )}

            {(code || codeAvailable) && (
              <div className="rounded-2xl border border-brand/30 bg-white p-6 text-center shadow-soft">
                <p className="text-sm font-medium text-muted-foreground">Your verification code</p>
                {code ? (
                  <>
                    <button
                      onClick={copyCode}
                      className="mx-auto mt-3 flex items-center gap-2 rounded-xl border border-dashed border-brand/40 bg-brand/5 px-4 py-3 font-mono text-3xl font-bold tracking-[0.35em] text-brand transition-colors hover:bg-brand/10"
                    >
                      {code}
                      {copied ? <Check className="h-5 w-5 text-green-600" /> : <Copy className="h-5 w-5 text-brand" />}
                    </button>
                    <p className="mt-3 text-xs text-muted-foreground">Tap the code to copy it.</p>
                  </>
                ) : (
                  <Loader2 className="mx-auto mt-4 h-6 w-6 animate-spin text-muted-foreground" />
                )}
                <div className="mt-4 rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                  Send this code in the WhatsApp chat where the game is running to continue.
                </div>
              </div>
            )}

            {codeError && <p className="text-center text-sm text-red-600">{codeError}</p>}

            {dt.ads.snippets.length > 0 && (
              <div className="space-y-3">
                {dt.ads.snippets.map((snip) => (
                  <div
                    key={snip.id}
                    className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft"
                  >
                    {snip.content ? (
                      <div
                        className="[&_a]:text-brand [&_button]:cursor-pointer"
                        dangerouslySetInnerHTML={{ __html: snip.content }}
                      />
                    ) : (
                      <div className="p-6 text-center text-sm text-muted-foreground">{snip.name}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {dt.ads.directLinkEnabled && dt.ads.directLink && (
              <a
                href={dt.ads.directLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-full border border-line bg-white px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-surface"
              >
                <ExternalLink className="h-4 w-4" /> Visit our sponsor
              </a>
            )}
          </div>
        )}
      </div>
    </Container>
  );
}