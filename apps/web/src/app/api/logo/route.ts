import { NextResponse } from "next/server";
import { serverSupabase } from "@/lib/supabase";

export async function GET() {
  // The logo is now stored in Supabase Storage; the public URL is kept in the
  // site.logo setting. Redirect there for backward compatibility.
  const { data } = await serverSupabase()
    .from("Setting")
    .select("value")
    .eq("key", "site.logo")
    .single();

  const url = (data as Record<string, unknown> | null)?.value as string | undefined;

  if (url) {
    return NextResponse.redirect(url, { headers: { "Cache-Control": "public, max-age=3600" } });
  }

  return new NextResponse(null, { status: 404 });
}
