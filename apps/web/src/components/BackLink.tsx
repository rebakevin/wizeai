import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";

export function BackLink({ to = "/account" }: { to?: string }) {
  return (
    <Link
      to={to}
      className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Back
    </Link>
  );
}
