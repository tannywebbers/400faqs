import { NextResponse } from "next/server";
import { serverSupabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await serverSupabase()
    .from("SiteAsset")
    .select("mime, data")
    .eq("key", "logo")
    .single();

  if (error || !data) {
    return new NextResponse(null, { status: 404 });
  }

  const row = data as Record<string, unknown>;
  const mime = (row.mime as string) ?? "image/png";
  const base64 = row.data as string;

  // The data is stored as base64 in the database (bytea → base64 via Supabase)
  const buffer = Buffer.from(base64, "base64");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
