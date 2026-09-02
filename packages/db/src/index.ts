import { PrismaClient } from "@prisma/client";

// Supabase runs Prisma through their connection pooler (transaction mode),
// which is picky about client pool sizes and timeouts. Without explicit
// limits Prisma defaults to a large pool and long hangs: under burst load the
// pooler raises "too many clients" and requests stall for seconds before
// erroring. Pin sane values unless the URL already overrides them.
function withPoolOptions(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("connection_limit")) parsed.searchParams.set("connection_limit", "5");
    if (!parsed.searchParams.has("pool_timeout")) parsed.searchParams.set("pool_timeout", "5000");
    if (!parsed.searchParams.has("connect_timeout")) parsed.searchParams.set("connect_timeout", "10000");
    return parsed.toString();
  } catch {
    return url;
  }
}

if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = withPoolOptions(process.env.DATABASE_URL);
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
export default prisma;