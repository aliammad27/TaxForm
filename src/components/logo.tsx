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
        "font-serif text-2xl leading-none tracking-tight text-foreground",
        className
      )}
    >
      TaxForm
      <span className="text-primary">*</span>
    </Link>
  );
}
