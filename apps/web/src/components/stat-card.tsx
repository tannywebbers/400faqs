import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { Skeleton } from "./ui/skeleton";

export function StatCard({
  title,
  value,
  icon: Icon,
  accent = "brand",
  suffix,
  loading,
}: {
  title: string;
  value: number | string;
  icon: LucideIcon;
  accent?: "brand" | "green" | "orange" | "purple" | "red";
  suffix?: string;
  loading?: boolean;
}) {
  const accentStyles: Record<string, string> = {
    brand: "bg-brand/10 text-brand-700",
    green: "bg-primary/10 text-primary-700",
    orange: "bg-accent/10 text-accent-700",
    purple: "bg-purple-100 text-purple-700",
    red: "bg-red-100 text-red-700",
  };

  return (
    <div className="glass rounded-2xl p-5 transition-all hover:shadow-glass-lg">
      <div className="flex items-center justify-between">
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", accentStyles[accent])}>
          <Icon className="h-5 w-5" />
        </div>
        {suffix && <span className="text-xs font-medium text-muted-foreground">{suffix}</span>}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-20" />
      ) : (
        <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
      )}
      <p className="mt-1 text-sm text-muted-foreground">{title}</p>
    </div>
  );
}
