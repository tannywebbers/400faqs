import type { Metadata } from "next";
import { getLegalContent, LegalDocument } from "@/components/layout/legal-page";

export const metadata: Metadata = { title: "Cookies Policy", description: "How 400faqs uses cookies and local storage." };

const FALLBACK_BLOCKS = [
  {
    heading: "What Cookies We Use",
    body: "400faqs uses essential cookies and local storage to keep you signed in and remember preferences. These are required for the site to function.",
  },
  {
    heading: "Managing Cookies",
    body: "You can clear site data in your browser at any time. Disabling essential cookies may affect how the site works.",
  },
  {
    heading: "Third-Party Cookies",
    body: "Advertising and analytics partners may set their own cookies. Their use is governed by their own policies.",
  },
];

export default async function CookiesPage() {
  const { title, blocks } = await getLegalContent("cookies_policy", "Cookies Policy", FALLBACK_BLOCKS);
  return <LegalDocument title={title} blocks={blocks} />;
}