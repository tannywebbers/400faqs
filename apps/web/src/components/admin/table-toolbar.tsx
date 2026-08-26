"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function AdminToolbar({
  search,
  onSearch,
  searchPlaceholder = "Search...",
  status,
  onStatusChange,
  statusOptions = [],
}: {
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder?: string;
  status: string;
  onStatusChange: (v: string) => void;
  statusOptions?: { label: string; value: string }[];
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder={searchPlaceholder} className="pl-9" />
      </div>
      {statusOptions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {statusOptions.map((opt) => {
            const isActive = opt.value === "all" ? status === "" : status === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => onStatusChange(opt.value === "all" ? "" : opt.value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  isActive ? "border-brand bg-brand text-white" : "border-line bg-white text-muted-foreground hover:bg-surface"
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
