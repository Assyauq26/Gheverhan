import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function SectionHeader({
  title,
  subtitle,
  href,
}: {
  title: string;
  subtitle?: string;
  href?: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between">
      <div>
        <h2 className="font-display text-xl font-extrabold text-ink md:text-2xl">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {href && (
        <Link
          href={href}
          className="flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-ink-soft hover:text-ink"
        >
          Lihat Semua <ArrowRight size={15} />
        </Link>
      )}
    </div>
  );
}
