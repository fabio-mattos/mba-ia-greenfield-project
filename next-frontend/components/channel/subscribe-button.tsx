"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { BellIcon } from "@/components/icons/bell-icon";

interface SubscribeButtonProps {
  nickname: string;
  initialSubscribed: boolean;
  initialCount: number;
  isLoggedIn: boolean;
}

export function SubscribeButton({
  nickname,
  initialSubscribed,
  initialCount,
  isLoggedIn,
}: SubscribeButtonProps) {
  const [subscribed, setSubscribed] = React.useState(initialSubscribed);
  const [count, setCount] = React.useState(initialCount);
  const [loading, setLoading] = React.useState(false);

  async function handleToggle() {
    if (!isLoggedIn || loading) return;
    setLoading(true);

    const method = subscribed ? "DELETE" : "POST";
    const res = await fetch(`/api/channels/${nickname}/subscribe`, { method });

    setLoading(false);

    if (res.ok) {
      const data = (await res.json()) as { isSubscribed: boolean; subscriberCount: number };
      setSubscribed(data.isSubscribed);
      setCount(data.subscriberCount);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleToggle}
        disabled={!isLoggedIn || loading}
        className={cn(
          "flex items-center gap-2 px-4 h-9 rounded-[var(--radius-full)]",
          "text-label-md transition-colors",
          subscribed
            ? "bg-muted text-foreground hover:bg-muted/80"
            : "bg-primary text-primary-foreground hover:opacity-90",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        {subscribed && <BellIcon className="size-4" />}
        {subscribed ? "Inscrito" : "Inscrever-se"}
      </button>
      <span className="text-body-md text-muted-foreground">
        {count.toLocaleString("pt-BR")} inscritos
      </span>
    </div>
  );
}
