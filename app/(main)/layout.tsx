import MainShell from "@/components/main-shell";
import { redirect } from "next/navigation";
import { getMainUserContext } from "@/lib/main-user-context";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const context = await getMainUserContext();
  if (!context) redirect("/login");

  return (
    <MainShell
      initialProfile={context.profile}
      initialSubscription={context.subscription}
      initialUnreadCount={context.unreadCount}
      initialMagnusStatus={context.magnusStatus}
    >
      {children}
    </MainShell>
  );
}
