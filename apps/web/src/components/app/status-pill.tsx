import { Badge } from "@/components/ui/badge";

const STATUS_MAP: Record<string, { label: string; variant: "green" | "orange" | "red" | "purple" | "gray" | "blue" }> = {
  APPROVED: { label: "Approved", variant: "green" },
  PENDING: { label: "Pending review", variant: "orange" },
  REJECTED: { label: "Rejected", variant: "red" },
  FLAGGED: { label: "Flagged", variant: "purple" },
  OPEN: { label: "Open", variant: "orange" },
  IN_PROGRESS: { label: "In progress", variant: "blue" },
  RESOLVED: { label: "Resolved", variant: "green" },
  DISMISSED: { label: "Dismissed", variant: "gray" },
  ACCEPTED: { label: "Accepted", variant: "green" },
};

export function StatusPill({ status }: { status: string }) {
  const mapped = STATUS_MAP[status] ?? { label: status, variant: "gray" as const };
  return <Badge variant={mapped.variant}>{mapped.label}</Badge>;
}

export function TypeBadge({ type }: { type?: string }) {
  if (!type || type === "NORMAL") return null;
  return <Badge variant={type === "TRUTH" ? "purple" : "orange"}>{type === "TRUTH" ? "Truth" : "Dare"}</Badge>;
}

export function AiBadge({ classification }: { classification: string | null }) {
  if (!classification) return <Badge variant="gray">Not checked</Badge>;
  if (classification === "EXACT_DUPLICATE") return <Badge variant="red">Exact duplicate</Badge>;
  if (classification === "VERY_SIMILAR") return <Badge variant="orange">Very similar</Badge>;
  return <Badge variant="green">Unique</Badge>;
}