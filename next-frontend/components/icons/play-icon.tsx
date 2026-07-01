import * as React from "react";
import { cn } from "@/lib/utils";

export function PlayIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...props}
      className={cn(props.className)}
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}
