"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Crown, X, CheckCircle } from "lucide-react";
import { adminActivateSubscription, adminDeactivateSubscription, adminAddSlots } from "@/app/admin/users/actions";

interface Props {
  userId: string;
  userName: string;
  activePlan: string | null;
}

export function UserActions({ userId, userName, activePlan }: Props) {
  const router = useRouter();
  const [modalType, setModalType] = useState<"plan" | "slots" | null>(null);
  
  const [planType, setPlanType] = useState<string>(activePlan || "plan_1");
  const [slotAmount, setSlotAmount] = useState<number>(10);
  const [slotType, setSlotType] = useState<"free" | "extra">("extra");
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleActivatePlan = async () => {
    setLoading(true);
    setMessage(null);
    const res = await adminActivateSubscription(userId, planType);
    if (res.success) {
      setMessage({ type: "success", text: `Plan activated successfully.` });
      router.refresh();
    } else {
      setMessage({ type: "error", text: res.error || "Failed to activate plan" });
    }
    setLoading(false);
  };

  const handleDeactivatePlan = async () => {
    if (!confirm("Are you sure you want to deactivate this user's active plan?")) return;
    setLoading(true);
    setMessage(null);
    const res = await adminDeactivateSubscription(userId);
    if (res.success) {
      setMessage({ type: "success", text: `Plan deactivated successfully.` });
      router.refresh();
    } else {
      setMessage({ type: "error", text: res.error || "Failed to deactivate plan" });
    }
    setLoading(false);
  };

  const handleAddSlots = async () => {
    setLoading(true);
    setMessage(null);
    const res = await adminAddSlots(userId, slotAmount, slotType);
    if (res.success) {
      setMessage({ type: "success", text: `Slots added successfully.` });
      router.refresh();
    } else {
      setMessage({ type: "error", text: res.error || "Failed to add slots" });
    }
    setLoading(false);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button 
          onClick={() => { setModalType("plan"); setMessage(null); }}
          className="p-1.5 rounded-md text-brand-600 hover:bg-brand-50 transition-colors"
          title="Manage Plan"
        >
          <Crown size={18} />
        </button>
        <button 
          onClick={() => { setModalType("slots"); setMessage(null); }}
          className="p-1.5 rounded-md text-green-600 hover:bg-green-50 transition-colors"
          title="Add Slots"
        >
          <Plus size={18} />
        </button>
      </div>

      {modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
          <div className="bg-card w-full max-w-md rounded-xl shadow-xl overflow-hidden animate-slide-up relative">
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h3 className="font-bold text-foreground">
                {modalType === "plan" ? `Manage Plan: ${userName}` : `Add Slots: ${userName}`}
              </h3>
              <button onClick={() => setModalType(null)} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {message && (
                <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                  <CheckCircle size={16} /> {message.text}
                </div>
              )}

              {modalType === "plan" ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Current Status</label>
                    <div className="p-3 bg-muted rounded-lg text-sm">
                      {activePlan ? <span className="font-bold text-brand-600">{activePlan}</span> : <span className="text-muted-foreground">No active plan</span>}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Select Plan</label>
                    <select 
                      value={planType}
                      onChange={(e) => setPlanType(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
                    >
                      <option value="plan_1">Basic Practice (plan_1)</option>
                      <option value="plan_2">Complete Prep (plan_2)</option>
                      <option value="plan_3">Exams Only (plan_3)</option>
                    </select>
                  </div>
                  
                  <div className="pt-2 flex items-center gap-3">
                    <button 
                      onClick={handleActivatePlan}
                      disabled={loading}
                      className="flex-1 bg-brand-600 hover:bg-brand-700 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {loading ? "Processing..." : "Activate Plan"}
                    </button>
                    {activePlan && (
                      <button 
                        onClick={handleDeactivatePlan}
                        disabled={loading}
                        className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        Deactivate Plan
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Slot Type</label>
                    <select 
                      value={slotType}
                      onChange={(e) => setSlotType(e.target.value as "free" | "extra")}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
                    >
                      <option value="free">Free Tests (No Plan Required)</option>
                      <option value="extra">Extra Plan Tests (Requires Active Plan)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">Amount</label>
                    <input 
                      type="number" 
                      value={slotAmount}
                      onChange={(e) => setSlotAmount(Number(e.target.value))}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
                      min={1}
                    />
                  </div>

                  <div className="pt-2">
                    <button 
                      onClick={handleAddSlots}
                      disabled={loading}
                      className="w-full bg-green-600 hover:bg-green-700 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {loading ? "Processing..." : "Add Slots"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
