import Link from "next/link";

import { cn } from "@/lib/utils";
import { StreamTubeIcon } from "@/components/icons/streamtube-icon";
import { SearchBar } from "@/components/layout/search-bar";
import { UserAvatarMenu } from "@/components/layout/user-avatar-menu";
import { getSession } from "@/lib/auth/session";

export async function Header() {
  const session = await getSession();

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b border-border bg-background",
        "flex items-center justify-between h-14 px-6 gap-6",
      )}
    >
      <Link href="/" className="flex items-center gap-2 shrink-0">
        <StreamTubeIcon className="size-7 text-foreground" />
        <span className="text-label-xl font-weight-700 text-foreground hidden sm:block">
          StreamTube
        </span>
      </Link>

      <div className="flex-1 max-w-2xl">
        <SearchBar />
      </div>

      <UserAvatarMenu
        isLoggedIn={session.isLoggedIn ?? false}
        email={session.email ?? ""}
      />
    </header>
  );
}
