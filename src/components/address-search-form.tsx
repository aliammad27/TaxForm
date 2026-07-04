import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AddressSearchFormProps = {
  buttonLabel?: string;
  placeholder?: string;
  helperText?: string;
  className?: string;
};

export function AddressSearchForm({
  buttonLabel = "Check my address",
  placeholder = "Street address or parcel ID",
  helperText = "No account. No credit card. County data only.",
  className = "",
}: AddressSearchFormProps) {
  return (
    <div className={className}>
      <form
        action="/score"
        method="GET"
        className="flex w-full max-w-md flex-col gap-2 sm:flex-row"
      >
        <Input
          name="q"
          placeholder={placeholder}
          className="h-11 flex-1 bg-card text-base"
          required
        />
        <Button type="submit" size="lg" className="h-11 px-5">
          {buttonLabel}
          <ArrowRight data-icon="inline-end" />
        </Button>
      </form>
      {helperText && (
        <p className="mt-3 font-mono text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
}
