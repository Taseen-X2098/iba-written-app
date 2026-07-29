import { createClient } from "@supabase/supabase-js";
import { Users as UsersIcon, Search, ShieldAlert, CheckCircle, Shield } from "lucide-react";
import { UserActions } from "@/components/admin/user-actions";

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  // Use Service Role to fetch auth.users (to get emails) and bypass RLS
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Fetch profiles
  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  // 2. Fetch auth users
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers();
  
  // 3. Fetch active subscriptions
  const { data: subscriptions } = await supabaseAdmin
    .from("subscriptions")
    .select("*")
    .eq("is_active", true);

  if (profilesError || authError) {
    return <div className="p-8 text-red-500">Error loading users. Check server logs.</div>;
  }

  // 4. Merge data
  const users = profiles?.map(profile => {
    const authUser = authData.users.find(u => u.id === profile.id);
    const sub = subscriptions?.find(s => s.user_id === profile.id);
    return {
      ...profile,
      email: authUser?.email || "No email",
      activePlan: sub?.plan_type || null,
    };
  }) || [];

  return (
    <div className="animate-fade-in max-w-6xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <UsersIcon className="text-brand-600" size={32} /> User Management
          </h1>
          <p className="text-muted-foreground mt-1">View and manage all registered students.</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30 flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input 
              type="text" 
              placeholder="Search by name or email..." 
              className="w-full bg-background border border-border rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-brand-500"
              disabled
            />
          </div>
          <span className="text-sm text-muted-foreground ml-auto">{users.length} Users</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-semibold text-muted-foreground">User</th>
                <th className="px-6 py-4 font-semibold text-muted-foreground">Institute</th>
                <th className="px-6 py-4 font-semibold text-muted-foreground">Status</th>
                <th className="px-6 py-4 font-semibold text-muted-foreground">Active Plan</th>
                <th className="px-6 py-4 font-semibold text-muted-foreground text-right">Free Tests</th>
                <th className="px-6 py-4 font-semibold text-muted-foreground text-right">Joined</th>
                <th className="px-6 py-4 font-semibold text-muted-foreground text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-brand-100 flex items-center justify-center font-bold text-brand-700">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-foreground">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {user.institute}
                  </td>
                  <td className="px-6 py-4">
                    {user.is_admin ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
                        <Shield size={14} /> Admin
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                        <CheckCircle size={14} /> Student
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {user.activePlan ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-brand-100 text-brand-700">
                        {user.activePlan}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">None</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right font-mono font-medium">
                    {user.free_tests_remaining}
                  </td>
                  <td className="px-6 py-4 text-right text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 flex justify-center">
                    <UserActions 
                      userId={user.id} 
                      userName={user.name} 
                      activePlan={user.activePlan} 
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
