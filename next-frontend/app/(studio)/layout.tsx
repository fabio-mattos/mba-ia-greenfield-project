import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { Header } from "@/components/layout/header";

export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container mx-auto max-w-5xl px-4 py-8">
        {children}
      </main>
    </div>
  );
}
