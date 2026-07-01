"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export function DescriptionExpander({ text }: { text: string }) {
  const [expanded, setExpanded] = React.useState(false);
  const needsTruncation = text.length > 200;

  return (
    <div className="flex flex-col gap-2">
      <p
        className={cn(
          "text-body-md text-foreground whitespace-pre-wrap",
          !expanded && needsTruncation && "line-clamp-3",
        )}
      >
        {text}
      </p>
      {needsTruncation && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="self-start text-label-md text-link hover:underline"
        >
          {expanded ? "Mostrar menos" : "Mostrar mais"}
        </button>
      )}
    </div>
  );
}
