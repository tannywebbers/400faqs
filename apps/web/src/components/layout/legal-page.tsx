import { Container } from "@/components/layout/container";
import { getLegalContent as getLegalContentFromDB } from "@/lib/queries/public-server";

export type LegalBlock = { heading: string; body: string };

function parseBlocks(content: string | null | undefined, fallback: LegalBlock[]): LegalBlock[] {
  if (!content) return fallback;
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length) {
      return parsed.map((b) => ({ heading: String(b?.heading ?? ""), body: String(b?.body ?? "") })).filter((b) => b.heading || b.body);
    }
  } catch {
    /* plain text fallback */
  }
  return fallback;
}

export async function getLegalContent(
  sectionKey: string,
  fallbackTitle: string,
  fallbackBlocks: LegalBlock[]
): Promise<{ title: string; blocks: LegalBlock[] }> {
  try {
    const section = await getLegalContentFromDB(sectionKey);
    if (section) {
      const blocks = parseBlocks(section.content, fallbackBlocks);
      return { title: section.title ?? fallbackTitle, blocks };
    }
  } catch {
    /* DB unreachable — fall back to defaults below */
  }
  return { title: fallbackTitle, blocks: fallbackBlocks };
}

export function LegalDocument({ title, blocks }: { title: string; blocks: LegalBlock[] }) {
  return (
    <Container className="py-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {blocks.map((b, i) => (
          <div key={b.heading || i} className="mt-8 rounded-3xl border border-line bg-white p-8 shadow-soft">
            <h2 className="text-xl font-semibold">{b.heading}</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-ink">{b.body}</p>
          </div>
        ))}
      </div>
    </Container>
  );
}