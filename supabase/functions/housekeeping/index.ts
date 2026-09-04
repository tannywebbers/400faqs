import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const results = {
    stuckNotifications: 0,
    expiredSessions: 0,
    abandonedSessions: 0,
    expiredGates: 0,
    cancelledGates: 0,
    deletedProcessedEvents: 0,
    deletedAuditLogs: 0,
  };

  try {
    // 1. Stuck-notification recovery
    const notifCutoff = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count: stuckCount } = await supabase
      .from("Notification")
      .update({ status: "FAILED", updatedAt: new Date().toISOString() })
      .eq("status", "SENDING")
      .lt("updatedAt", notifCutoff);
    results.stuckNotifications = stuckCount ?? 0;

    // 2. Session sweep
    // 2a. Expire WAITING sessions past expiresAt
    const { count: expiredCount } = await supabase
      .from("Session")
      .update({ status: "ABANDONED", state: "EXPIRED", updatedAt: new Date().toISOString() })
      .eq("status", "WAITING")
      .lt("expiresAt", new Date().toISOString());
    results.expiredSessions = expiredCount ?? 0;

    // 2b. Time-out ACTIVE sessions past turnTimeoutMinutes * 2
    const { data: turnSetting } = await supabase
      .from("Setting")
      .select("value")
      .eq("key", "game.turnTimeoutMinutes")
      .single();
    const timeoutMin = Number(turnSetting?.value ?? 5);
    const activeCutoff = new Date(Date.now() - timeoutMin * 2 * 60_000).toISOString();
    const { count: abandonedCount } = await supabase
      .from("Session")
      .update({ status: "ABANDONED", updatedAt: new Date().toISOString() })
      .eq("status", "ACTIVE")
      .lt("lastActivityAt", activeCutoff);
    results.abandonedSessions = abandonedCount ?? 0;

    // 3. Monetization gate reconciliation
    const { data: staleGates } = await supabase
      .from("MonetizationGate")
      .select("id, sessionId, expiresAt")
      .eq("status", "PENDING")
      .lt("expiresAt", new Date().toISOString())
      .limit(500);

    if (staleGates && staleGates.length > 0) {
      const sessionIds = [...new Set(staleGates.map((g: { sessionId: string }) => g.sessionId))];
      const { data: sessions } = await supabase
        .from("Session")
        .select("id, status")
        .in("id", sessionIds);
      const statusById = new Map((sessions ?? []).map((s: { id: string; status: string }) => [s.id, s.status]));

      for (const gate of staleGates) {
        const sessionStatus = statusById.get((gate as { sessionId: string }).sessionId);
        if (sessionStatus !== "ACTIVE") {
          await supabase
            .from("MonetizationGate")
            .update({ status: "CANCELLED" })
            .eq("id", (gate as { id: string }).id);
          results.cancelledGates++;
        } else {
          await supabase
            .from("MonetizationGate")
            .update({ status: "EXPIRED" })
            .eq("id", (gate as { id: string }).id);
          results.expiredGates++;
        }
      }
    }

    // 4. Retention cleanup
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { count: deletedEvents } = await supabase
      .from("ProcessedEvent")
      .delete()
      .lt("processedAt", sevenDaysAgo);
    results.deletedProcessedEvents = deletedEvents ?? 0;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { count: deletedLogs } = await supabase
      .from("AuditLog")
      .delete()
      .eq("action", "LOGIN")
      .lt("createdAt", thirtyDaysAgo);
    results.deletedAuditLogs = deletedLogs ?? 0;

    // 5. Update last cron run timestamp
    await supabase
      .from("Setting")
      .upsert({
        key: "system.lastCronRun",
        value: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

    return new Response(
      JSON.stringify({ success: true, data: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message, data: results }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
