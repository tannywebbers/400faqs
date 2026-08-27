import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type AppCategory = {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  gameType: "NORMAL" | "TRUTH_DARE";
  questionCount: number;
  playCount: number;
  trending: boolean;
};

export function CategoryCard({ c }: { c: AppCategory }) {
  return (
    <Link href={`/app/categories/${c.slug}`} className="glass card-hover block rounded-2xl p-5">
      <div className="flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl text-xl" style={{ backgroundColor: `${c.color}18`, color: c.color }}>
          {c.icon}
        </div>
        {c.trending && (
          <Badge variant="orange" className="gap-1">
            <TrendingUp className="h-3 w-3" /> Trending
          </Badge>
        )}
      </div>
      <h3 className="mt-3 font-semibold">{c.name}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
      <div className="mt-3 flex items-center gap-3 text-xs font-medium text-muted-foreground">
        <span>{c.questionCount.toLocaleString()} questions</span>
        <span>{c.playCount.toLocaleString()} plays</span>
      </div>
    </Link>
  );
}