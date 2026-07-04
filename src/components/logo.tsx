import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({
  href = "/",
  className,
}: {
  href?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "font-serif text-[26px] leading-none tracking-[-0.01em] text-foreground",
        className
      )}
    >
      Equarra
      <span className="text-primary">*</span>
    </Link>
  );
}
