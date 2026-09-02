import type { Metadata } from "next";
import { getLegalContent, LegalDocument } from "@/components/layout/legal-page";

export const metadata: Metadata = { title: "Privacy Policy", description: "How 400faqs handles your data." };

const FALLBACK_BLOCKS = [
  {
    heading: "Information We Collect",
    body: "We collect only the information needed to provide the 400faqs game: your WhatsApp phone number, game sessions, and any questions you contribute.",
  },
  {
    heading: "How We Use Your Data",
    body: "Your data is used to run the game, verify community questions, send you game updates, and improve the service. We never sell personal data.",
  },
  {
    heading: "Third-Party Services",
    body: "We use trusted service providers (hosting, databases, and messaging infrastructure) to operate 400faqs. They process data only on our behalf.",
  },
];

export default async function PrivacyPage() {
  const { title, blocks } = await getLegalContent("privacy_policy", "Privacy Policy", FALLBACK_BLOCKS);
  return <LegalDocument title={title} blocks={blocks} />;
}