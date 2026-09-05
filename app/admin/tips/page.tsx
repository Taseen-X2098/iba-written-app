import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { Lightbulb, Plus, Trash2 } from "lucide-react";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const tipContentSchema = z.string().trim().min(1).max(1_000);
const tipIdSchema = z.string().uuid();

function revalidateTipViews() {
  revalidatePath("/admin/tips");
  revalidatePath("/tips");
  revalidatePath("/");
}

export default async function AdminTipsPage() {
  const supabase = await createClient();
  const { data: tips, error } = await supabase
    .from("tips")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching tips:", error);
  }

  const safeTips = tips || [];

  async function addTip(formData: FormData) {
    "use server";
    await requireAdminUser();
    const parsed = tipContentSchema.safeParse(formData.get("content"));
    if (!parsed.success) return;

    const { error } = await createAdminClient()
      .from("tips")
      .insert({ content: parsed.data, is_active: true });
    if (error) throw error;
    revalidateTipViews();
  }

  async function deleteTip(formData: FormData) {
    "use server";
    await requireAdminUser();
    const parsed = tipIdSchema.safeParse(formData.get("id"));
    if (!parsed.success) return;

    const { error } = await createAdminClient().from("tips").delete().eq("id", parsed.data);
    if (error) throw error;
    revalidateTipViews();
  }

  return (
    <div className="animate-fade-in max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="h-10 w-10 rounded-lg bg-yellow-50 flex items-center justify-center">
          <Lightbulb size={20} className="text-yellow-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Manage Daily Tips</h1>
          <p className="text-muted-foreground text-sm">Add helpful tips that appear on the student dashboard.</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 mb-8">
        <h2 className="text-lg font-bold mb-4">Add New Tip</h2>
        <form action={addTip} className="flex gap-4">
          <input 
            type="text" 
            name="content" 
            required
            placeholder="e.g. For paragraph questions, aim for a clear topic sentence..."
            className="flex-1 bg-background border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button 
            type="submit"
            className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors flex items-center gap-2"
          >
            <Plus size={16} /> Add Tip
          </button>
        </form>
      </div>

      <div className="space-y-4">
        {safeTips.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-xl bg-card">
            No tips created yet.
          </div>
        ) : (
          safeTips.map(tip => (
            <div key={tip.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between group hover:border-brand-300 transition-colors">
              <div className="flex items-start gap-3">
                <Lightbulb size={18} className="text-yellow-500 mt-0.5 shrink-0" />
                <p className="text-foreground text-sm font-medium leading-relaxed">{tip.content}</p>
              </div>
              
              <form action={deleteTip}>
                <input type="hidden" name="id" value={tip.id} />
                <button 
                  type="submit"
                  className="text-muted-foreground hover:text-red-500 p-2 opacity-0 group-hover:opacity-100 transition-all"
                  title="Delete Tip"
                >
                  <Trash2 size={16} />
                </button>
              </form>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
