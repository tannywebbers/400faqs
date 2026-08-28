import { Router } from "express";
import { z } from "zod";
import { ok } from "../../lib/response";
import { validate } from "../../middleware/validate";
import {
  getAdminAnalytics,
  getWhatsAppStats,
  getAIStats,
  getCategoryAnalytics,
  getTopQuestions,
  parseDateRange,
  buildDaySeries,
} from "../../services/analytics";
import {
  getAnalyticsOverview,
  getUserAnalytics,
  getSessionAnalytics,
  getContributionAnalytics,
  getAIAnalytics,
  getWhatsAppAdvanced,
  getMonetizationAnalytics,
  getRevenueAnalytics,
  getTimeseries,
  getTopAnalytics,
  renderAnalyticsCsv,
  getQuestionAnalytics,
  getCategoryRankings,
} from "../../services/analytics-advanced";
import { getSnapshotSeries, getLatestSnapshot, captureAnalyticsSnapshot } from "../../services/snapshot";
import { prisma } from "../../lib/prisma";

export const analyticsRouter = Router();

const dateQuerySchema = z.object({
  query: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
  }),
});

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function queryRange(req: unknown): { from?: string; to?: string } {
  const q = (req as { validated?: { query?: { from?: string; to?: string } } }).validated?.query ?? {};
  return { from: q.from, to: q.to };
}

// ── Platform analytics (date range) ─────────────────────────

analyticsRouter.get("/", validate(dateQuerySchema), async (req, res) => {
  const { from, to } = queryRange(req);
  const data = await getAdminAnalytics(from, to);
  res.json(ok(data));
});

// ── WhatsApp analytics ───────────────────────────────────────

analyticsRouter.get("/whatsapp", validate(dateQuerySchema), async (req, res) => {
  const { from, to } = (req as unknown as { validated: { query: { from?: string; to?: string } } }).validated.query;
  const data = await getWhatsAppStats(from, to);
  res.json(ok(data));
});

// ── AI / duplicate detection analytics ───────────────────────

analyticsRouter.get("/ai", validate(dateQuerySchema), async (req, res) => {
  const { from, to } = (req as unknown as { validated: { query: { from?: string; to?: string } } }).validated.query;
  const data = await getAIStats(from, to);
  res.json(ok(data));
});

// ── Category analytics ───────────────────────────────────────

analyticsRouter.get("/categories", async (_req, res) => {
  const data = await getCategoryAnalytics();
  res.json(ok(data));
});

// ── Top questions ────────────────────────────────────────────

analyticsRouter.get("/questions", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 10), 100);
  const data = await getTopQuestions(limit);
  res.json(ok(data));
});

// ── Snapshots ────────────────────────────────────────────────

analyticsRouter.get("/snapshots", async (req, res) => {
  const days = Math.min(Number(req.query.days ?? 90), 3650);
  const data = await getSnapshotSeries(days);
  res.json(ok(data));
});

analyticsRouter.get("/snapshots/latest", async (_req, res) => {
  const latest = await getLatestSnapshot();
  res.json(ok(latest ?? null));
});

analyticsRouter.post("/snapshots/capture", async (_req, res) => {
  await captureAnalyticsSnapshot(true);
  res.json(ok({ message: "Snapshot captured" }));
});

// ── Advanced BI endpoints (Phase 11) ─────────────────────────

// Business intelligence overview: KPI cards with trend-vs-previous-period.
analyticsRouter.get("/overview", validate(dateQuerySchema), async (req, res) => {
  const { from, to } = queryRange(req);
  const data = await getAnalyticsOverview(from, to);
  res.json(ok(data));
});

// User analytics: totals, new/active/returning, per-day series, top players.
analyticsRouter.get("/users", validate(dateQuerySchema), async (req, res) => {
  const { from, to } = queryRange(req);
  const data = await getUserAnalytics(from, to);
  res.json(ok(data));
});

// Session analytics: creation/completion/abandonment, category & game-type breakdowns.
analyticsRouter.get("/sessions", validate(dateQuerySchema), async (req, res) => {
  const { from, to } = queryRange(req);
  const data = await getSessionAnalytics(from, to);
  res.json(ok(data));
});

// Contribution lifecycle + AI duplicate classification analytics.
analyticsRouter.get("/contributions", validate(dateQuerySchema), async (req, res) => {
  const { from, to } = queryRange(req);
  const data = await getContributionAnalytics(from, to);
  res.json(ok(data));
});

// Google-AI moderation analytics (cost data intentionally unavailable).
analyticsRouter.get("/ai/advanced", validate(dateQuerySchema), async (req, res) => {
  const { from, to } = queryRange(req);
  const data = await getAIAnalytics(from, to);
  res.json(ok(data));
});

// WhatsApp advanced analytics: directions, states, hourly distribution, templates.
analyticsRouter.get("/whatsapp/advanced", validate(dateQuerySchema), async (req, res) => {
  const { from, to } = queryRange(req);
  const data = await getWhatsAppAdvanced(from, to);
  res.json(ok(data));
});

// Monetization analytics: gates, providers, event map, 8-step funnel.
analyticsRouter.get("/monetization", validate(dateQuerySchema), async (req, res) => {
  const { from, to } = queryRange(req);
  const data = await getMonetizationAnalytics(from, to);
  res.json(ok(data));
});

// Revenue ledger analytics: estimated vs confirmed, by provider/category/event-type.
analyticsRouter.get("/revenue", validate(dateQuerySchema), async (req, res) => {
  const { from, to } = queryRange(req);
  const data = await getRevenueAnalytics(from, to);
  res.json(ok(data));
});

// Multi-metric daily timeseries.
analyticsRouter.get("/timeseries", validate(dateQuerySchema), async (req, res) => {
  const { from, to } = queryRange(req);
  const data = await getTimeseries(from, to);
  res.json(ok(data));
});

// Top lists: most-played questions, top categories, contributors, players, templates.
analyticsRouter.get("/top", validate(dateQuerySchema), async (req, res) => {
  const { from, to } = queryRange(req);
  const data = await getTopAnalytics(from, to);
  res.json(ok(data));
});

// Monetization funnel (gameplay -> gate -> link -> countdown -> code -> submit -> verified -> resume).
analyticsRouter.get("/monetization/funnel", validate(dateQuerySchema), async (req, res) => {
  const { from, to } = queryRange(req);
  const data = await getMonetizationAnalytics(from, to);
  res.json(ok({ range: data.range, funnel: data.funnel, totals: data.totals, series: data.series }));
});

// Question/content library deep-dive.
analyticsRouter.get("/questions/advanced", async (_req, res) => {
  const data = await getQuestionAnalytics();
  res.json(ok(data));
});

// Category rankings with monetization + verification breakdown.
analyticsRouter.get("/categories/rankings", async (_req, res) => {
  const data = await getCategoryRankings();
  res.json(ok(data));
});

// ── CSV export ───────────────────────────────────────────────

analyticsRouter.get("/export", validate(dateQuerySchema), async (req, res) => {
  const { from, to } = queryRange(req);
  const dataset = String(((req as unknown as { query: { dataset?: unknown } }).query.dataset) ?? "overview");
  const { start, end } = parseDateRange(from, to);
  const isLegacy = dataset === "overview";

  const csv = isLegacy ? await (async () => {
    const data = await getAdminAnalytics(from, to);
    const columns = ["date", "users", "questions", "sessions", "moves", "contributions", "reports", "categoryRequests", "messages", "revenueLedger", "campaigns"];
    const header = columns.map(csvEscape).join(",");
    const seriesRows = data.series.map((p) => columns.map((c) => csvEscape((p as unknown as Record<string, unknown>)[c])).join(","));
    const totalRow = columns.map((c) => csvEscape(c === "date" ? "TOTAL" : data.totals[c] ?? 0)).join(",");
    return [header, ...seriesRows, totalRow].join("\n");
  })() : await renderAnalyticsCsv(dataset, from, to);

  const filename = `analytics-${dataset}-${start.toISOString().slice(0, 10)}-${end.toISOString().slice(0, 10)}.csv`;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

// ── Session funnel (deviation data for the UI) ───────────────

analyticsRouter.get("/funnel", async (req, res) => {
  const { start, end } = parseDateRange(req.query.from as string | undefined, req.query.to as string | undefined);
  const days = buildDaySeries(start, end);

  const [sessions, completed, invites, categoryPicks] = await Promise.all([
    prisma.session.groupBy({ by: ["createdAt"], _count: { _all: true }, where: { createdAt: { gte: start, lte: end } } }),
    prisma.session.groupBy({ by: ["createdAt"], _count: { _all: true }, where: { status: "COMPLETED", createdAt: { gte: start, lte: end } } }),
    prisma.session.groupBy({ by: ["createdAt"], _count: { _all: true }, where: { joinerId: { not: null }, createdAt: { gte: start, lte: end } } }),
    prisma.session.groupBy({ by: ["createdAt"], _count: { _all: true }, where: { categoryId: { not: null }, createdAt: { gte: start, lte: end } } }),
  ]);

  const toMap = (rows: { createdAt: Date; _count: { _all: number } }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = r.createdAt.toISOString().slice(0, 10);
      m.set(k, (m.get(k) ?? 0) + r._count._all);
    }
    return m;
  };

  const sMap = toMap(sessions as { createdAt: Date; _count: { _all: number } }[]);
  const cMap = toMap(completed as { createdAt: Date; _count: { _all: number } }[]);
  const iMap = toMap(invites as { createdAt: Date; _count: { _all: number } }[]);
  const pMap = toMap(categoryPicks as { createdAt: Date; _count: { _all: number } }[]);

  for (const d of days) {
    const totals = {
      sessions: sMap.get(d) ?? 0,
      completed: cMap.get(d) ?? 0,
      joined: iMap.get(d) ?? 0,
      categoryPicked: pMap.get(d) ?? 0,
    };
    void totals;
  }

  res.json(
    ok({
      start: start.toISOString(),
      end: end.toISOString(),
      days,
      series: days.map((date) => ({
        date,
        sessions: sMap.get(date) ?? 0,
        joined: iMap.get(date) ?? 0,
        categoryPicked: pMap.get(date) ?? 0,
        completed: cMap.get(date) ?? 0,
      })),
    })
  );
});