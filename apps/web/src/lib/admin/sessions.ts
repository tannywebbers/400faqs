"use server";

import { serverSupabase } from "@/lib/supabase";
import { requireAdmin, paginate, type PaginatedResult } from "./shared";

export type SessionRow = {
  id: string;
  status: string;
  state: string;
  round: number;
  turnsPlayed: number;
  createdAt: string;
  lastActivityAt: string;
  creator: { phone: string; name: string | null };
  joiner: { phone: string; name: string | null } | null;
  category: { name: string; slug: string } | null;
  moveCount: number;
};

export type SessionDetail = SessionRow & {
  winner: { name: string } | null;
  moves: {
    id: string;
    round: number;
    number: number | null;
    type: string;
    status: string;
    answer: string | null;
    createdAt: string;
    answeredAt: string | null;
    question: { text: string; type: string };
    askedByUser: { phone: string };
    answeredByUser: { phone: string };
  }[];
};

export async function listSessions(params: { page?: number; limit?: number; q?: string; status?: string } = {}): Promise<PaginatedResult<SessionRow>> {
  await requireAdmin();
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;

  let query = serverSupabase()
    .from("Session")
    .select(
      "id, status, state, round, turnsPlayed, createdAt, lastActivityAt, Creator:creatorId(phone, name), Joiner:joinerId(phone, name), Category:categoryId(name, slug), GameMove:sessionId(id)",
      { count: "exact" },
    );

  if (params.status) query = query.eq("status", params.status);

  query = query.order("createdAt", { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const items = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id,
    status: r.status,
    state: r.state,
    round: r.round,
    turnsPlayed: r.turnsPlayed,
    createdAt: r.createdAt,
    lastActivityAt: r.lastActivityAt,
    creator: r.Creator ?? { phone: "", name: null },
    joiner: r.Joiner ?? null,
    category: r.Category ?? null,
    moveCount: Array.isArray(r.GameMove) ? r.GameMove.length : 0,
  })) as SessionRow[];

  return paginate(items, page, limit, count ?? 0);
}

export async function getSessionDetail(id: string): Promise<SessionDetail> {
  await requireAdmin();

  const { data: session, error } = await serverSupabase()
    .from("Session")
    .select(
      "id, status, state, round, turnsPlayed, createdAt, lastActivityAt, Creator:creatorId(phone, name), Joiner:joinerId(phone, name), Category:categoryId(name, slug), Winner:winnerId(name)",
    )
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  if (!session) throw new Error("Session not found");

  const { data: moves, error: movesError } = await serverSupabase()
    .from("GameMove")
    .select(
      "id, round, number, type, status, answer, createdAt, answeredAt, Question:questionId(text, type), AskedBy:askedBy(phone), AnsweredBy:answeredBy(phone)",
    )
    .eq("sessionId", id)
    .order("createdAt", { ascending: true });
  if (movesError) throw new Error(movesError.message);

  const s = session as Record<string, unknown>;
  const moveList = (moves ?? []) as Record<string, unknown>[];
  return {
    id: s.id,
    status: s.status,
    state: s.state,
    round: s.round,
    turnsPlayed: s.turnsPlayed,
    createdAt: s.createdAt,
    lastActivityAt: s.lastActivityAt,
    creator: (s.Creator ?? { phone: "", name: null }) as SessionRow["creator"],
    joiner: (s.Joiner ?? null) as SessionRow["joiner"],
    category: (s.Category ?? null) as SessionRow["category"],
    winner: (s.Winner ?? null) as SessionDetail["winner"],
    moveCount: moveList.length,
    moves: moveList.map((m) => ({
      id: m.id,
      round: m.round,
      number: m.number,
      type: m.type,
      status: m.status,
      answer: m.answer,
      createdAt: m.createdAt,
      answeredAt: m.answeredAt,
      question: m.Question as { text: string; type: string },
      askedByUser: m.AskedBy as { phone: string },
      answeredByUser: m.AnsweredBy as { phone: string },
    })),
  } as SessionDetail;
}
