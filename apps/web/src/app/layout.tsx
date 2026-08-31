import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { WhatsAppFloat } from "@/components/whatsapp-float";
import { apiUrl } from "@/lib/api";

async function getDefaultSeo() {
  try {
    const res = await fetch(apiUrl("/api/public/settings"), { next: { revalidate: 300 } });
    if (res.ok) {
      const payload = (await res.json()) as { data: Record<string, string> };
      return payload.data;
    }
  } catch {
    /* offline fallback */
  }
  return {};
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getDefaultSeo();
  const title = settings["seo.defaultTitle"] ?? "400faqs - The Ultimate WhatsApp Questions Game";
  const description = settings["seo.defaultDescription"] ?? "Challenge your friends. Ask hundreds of questions. Play Truth or Dare inside WhatsApp. No app install needed.";
  const ogImage = settings["seo.defaultOgImage"] ?? undefined;

  return {
    title: { default: title, template: `%s | ${settings["site.name"] ?? "400faqs"}` },
    description,
    metadataBase: new URL(process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000"),
    openGraph: {
      type: "website",
      siteName: settings["site.name"] ?? "400faqs",
      title,
      description,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    robots: { index: true, follow: true },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <Providers>
          <div className="flex min-h-screen flex-col">
            {children}
          </div>
          <WhatsAppFloat />
        </Providers>
      </body>
    </html>
  );
}
