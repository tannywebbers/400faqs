import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { cacheKeys, cacheGet, cacheSet } from "../lib/redis";

export type LeaderboardEntry = {
  id: string;
  phone: string;
  name: string | null;
  contributions: number;
  approved: number;
  rejected: number;
  pending: number;
  played: number;
  badges: number;
};

export async function getLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  const cached = await cacheGet<LeaderboardEntry[]>(cacheKeys.leaderboard);
  if (cached) return cached.slice(0, limit);

  const [contributions, approved, rejected, pending, played, badgeCounts] = await Promise.all([
    prisma.contribution.groupBy({ by: ["userId"], _count: { _all: true } }),
    prisma.contribution.groupBy({ by: ["userId"], where: { status: "APPROVED" }, _count: { _all: true } }),
    prisma.contribution.groupBy({ by: ["userId"], where: { status: "REJECTED" }, _count: { _all: true } }),
    prisma.contribution.groupBy({ by: ["userId"], where: { status: "PENDING" }, _count: { _all: true } }),
    prisma.user.findMany({ select: { id: true, totalSessions: true } }),
    prisma.userBadge.groupBy({ by: ["userId"], _count: { _all: true } }),
  ]);

  const playedMap = new Map(played.map((u) => [u.id, u.totalSessions]));
  const badgeMap = new Map(badgeCounts.map((b) => [b.userId, b._count._all]));
  const countMap = (rows: { userId: string | null; _count: { _all: number } }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.userId) m.set(r.userId, (m.get(r.userId) ?? 0) + r._count._all);
    return m;
  };
  const contribMap = countMap(contributions);
  const approvedMap = countMap(approved);
  const rejectedMap = countMap(rejected);
  const pendingMap = countMap(pending);

  const userIds = [...new Set([...contribMap.keys(), ...approvedMap.keys(), ...rejectedMap.keys(), ...pendingMap.keys()])];

  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, phone: true, name: true, displayName: true } });

  const rows: LeaderboardEntry[] = users.map((u) => ({
    id: u.id,
    phone: u.phone,
    name: u.displayName ?? u.name,
    contributions: contribMap.get(u.id) ?? 0,
    approved: approvedMap.get(u.id) ?? 0,
    rejected: rejectedMap.get(u.id) ?? 0,
    pending: pendingMap.get(u.id) ?? 0,
    played: playedMap.get(u.id) ?? 0,
    badges: badgeMap.get(u.id) ?? 0,
  }));

  rows.sort((a, b) => b.approved - a.approved || b.contributions - a.contributions || b.played - a.played);

  await cacheSet(cacheKeys.leaderboard, rows, 600);
  return rows.slice(0, limit);
}
