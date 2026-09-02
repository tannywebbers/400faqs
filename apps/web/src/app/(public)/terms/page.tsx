import type { Metadata } from "next";
import { getLegalContent, LegalDocument } from "@/components/layout/legal-page";

export const metadata: Metadata = { title: "Terms of Service", description: "The terms governing your use of 400faqs." };

const FALLBACK_BLOCKS = [
  {
    heading: "Acceptance of Terms",
    body: "By using 400faqs you agree to these terms. The game is provided as-is for personal, non-commercial entertainment.",
  },
  {
    heading: "Community Content",
    body: "You retain ownership of questions you contribute, and grant 400faqs a license to display, review, and moderate them. Keep contributions respectful and age-appropriate.",
  },
  {
    heading: "Acceptable Use",
    body: "Do not abuse, spam, harass, or attempt to harm the service or other players. We may remove content or restrict access that violates these rules.",
  },
];

export default async function TermsPage() {
  const { title, blocks } = await getLegalContent("terms_of_service", "Terms of Service", FALLBACK_BLOCKS);
  return <LegalDocument title={title} blocks={blocks} />;
}