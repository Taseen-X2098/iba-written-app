import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { 
  LayoutDashboard, 
  Settings,
  Users,
  LogOut,
  FileText,
  CheckCircle,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  // Check if admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    // If not admin, redirect them back to the main app
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-muted/30 flex">
      {/* Desktop Sidenav */}
      <aside className="hidden md:flex flex-col w-64 bg-card border-r border-border h-screen sticky top-0">
        <div className="p-6 border-b border-border">
          <Link href="/admin" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-red-600 flex items-center justify-center">
              <span className="text-white font-black text-sm">ADMIN</span>
            </div>
            <span className="font-bold text-xl tracking-tight text-foreground">
              Dashboard
            </span>
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <NavItem href="/admin" icon={<LayoutDashboard size={20} />} label="Overview" />
          <NavItem href="/admin/exams" icon={<FileText size={20} />} label="Manage Exams" />
          <NavItem href="/admin/grading" icon={<CheckCircle size={20} />} label="Grading Queue" />
          <NavItem href="/admin/users" icon={<Users size={20} />} label="Users" />
          <NavItem href="/admin/settings" icon={<Settings size={20} />} label="Settings" />
        </nav>

        <div className="p-4 border-t border-border">
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-muted-foreground rounded-lg hover:text-red-600 hover:bg-red-50 transition-colors w-full"
            >
              <LogOut size={20} />
              Logout
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 flex flex-col min-h-screen">
        <div className="md:hidden border-b border-border bg-card p-4 flex items-center justify-between sticky top-0 z-50">
           <Link href="/admin" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-red-600 flex items-center justify-center">
              <span className="text-white font-black text-sm">A</span>
            </div>
            <span className="font-bold text-lg text-foreground">Admin</span>
          </Link>
        </div>
        
        <div className="flex-1 p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

function NavItem({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-muted-foreground rounded-lg hover:bg-muted hover:text-foreground transition-all group"
    >
      <span className="group-hover:text-brand-600 transition-colors">{icon}</span>
      {label}
    </Link>
  );
}
