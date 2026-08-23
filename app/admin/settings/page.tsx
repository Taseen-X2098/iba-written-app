import {
  BellRing,
  Clock,
  CreditCard,
  Plus,
  Save,
  Server,
  Settings as SettingsIcon,
  Trash2,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  addPracticeNotificationHook,
  deletePracticeNotificationHook,
  saveRetentionNotificationSettings,
  updatePracticeNotificationHook,
} from "./notification-actions";

export const dynamic = 'force-dynamic';

const DEFAULT_SETTINGS = {
  practice_enabled: true,
  practice_time: "19:00:00",
  exam_reminder_enabled: true,
  exam_reminder_minutes_before: 60,
  subscription_expiry_enabled: true,
  subscription_expiry_days_before: 5,
  subscription_lapsed_enabled: true,
  subscription_lapsed_days_after: 5,
};

export default async function AdminSettingsPage() {
  const admin = createAdminClient();
  const [{ data: storedSettings, error: settingsError }, { data: hooks, error: hooksError }] = await Promise.all([
    admin.from("retention_notification_settings").select("*").eq("id", 1).maybeSingle(),
    admin.from("practice_notification_hooks").select("*").order("created_at"),
  ]);
  if (settingsError) console.error("Unable to load retention notification settings", settingsError);
  if (hooksError) console.error("Unable to load practice notification hooks", hooksError);
  const settings = storedSettings ?? DEFAULT_SETTINGS;
  const safeHooks = hooks ?? [];

  return (
    <div className="animate-fade-in max-w-6xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <SettingsIcon className="text-brand-600" size={32} /> System Settings
          </h1>
          <p className="text-muted-foreground mt-1">Configure global application variables and APIs.</p>
        </div>
      </div>

      <div className="space-y-8">
        <section className="bg-card border border-border rounded-xl shadow-sm p-6">
          <div className="flex items-start gap-3 mb-6">
            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center text-purple-700 shrink-0">
              <BellRing size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold">Retention notifications</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Times use Bangladesh time. Practice reminders remain fixed to Monday and Wednesday.
              </p>
            </div>
          </div>

          <form action={saveRetentionNotificationSettings} className="grid gap-4 md:grid-cols-2">
            <NotificationScheduleField
              name="practiceEnabled"
              label="Monday & Wednesday practice"
              description="Remind active Practice and Complete plan students."
              defaultChecked={settings.practice_enabled}
            >
              <label className="text-xs font-medium text-muted-foreground">
                Send at
                <input
                  name="practiceTime"
                  type="time"
                  required
                  defaultValue={String(settings.practice_time).slice(0, 5)}
                  className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
            </NotificationScheduleField>

            <NotificationScheduleField
              name="examReminderEnabled"
              label="Upcoming exam reminder"
              description="Remind eligible Complete and Exam plan students."
              defaultChecked={settings.exam_reminder_enabled}
            >
              <NumberField
                name="examReminderMinutes"
                label="Minutes before start"
                min={5}
                max={10080}
                value={settings.exam_reminder_minutes_before}
              />
            </NotificationScheduleField>

            <NotificationScheduleField
              name="expiryEnabled"
              label="Plan ending reminder"
              description="Includes honest feedback drawn from each student's history."
              defaultChecked={settings.subscription_expiry_enabled}
            >
              <NumberField
                name="expiryDays"
                label="Days before plan ends"
                min={1}
                max={30}
                value={settings.subscription_expiry_days_before}
              />
            </NotificationScheduleField>

            <NotificationScheduleField
              name="lapsedEnabled"
              label="Plan lapsed follow-up"
              description="Sends both a push/in-app notification and a Brevo email."
              defaultChecked={settings.subscription_lapsed_enabled}
            >
              <NumberField
                name="lapsedDays"
                label="Days after plan ends"
                min={1}
                max={30}
                value={settings.subscription_lapsed_days_after}
              />
            </NotificationScheduleField>

            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                <Save size={16} /> Save notification settings
              </button>
            </div>
          </form>
        </section>

        <section className="bg-card border border-border rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="text-xl font-bold">Practice hook lines</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Selected lines are rotated across Monday and Wednesday reminders. If none are selected, a safe default is used.
              </p>
            </div>
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              {safeHooks.filter((hook) => hook.is_active).length} selected
            </span>
          </div>

          <form action={addPracticeNotificationHook} className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              name="content"
              required
              maxLength={240}
              placeholder="Add a concise practice hook..."
              className="flex-1 rounded-lg border border-border bg-background px-4 py-2 text-sm"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Plus size={16} /> Add line
            </button>
          </form>

          <div className="mt-5 space-y-3">
            {safeHooks.map((hook) => (
              <div key={hook.id} className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-3 sm:flex-row sm:items-center">
                <form action={updatePracticeNotificationHook} className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                  <input type="hidden" name="id" value={hook.id} />
                  <label className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <input name="isActive" type="checkbox" defaultChecked={hook.is_active} className="h-4 w-4 accent-green-600" />
                    Selected
                  </label>
                  <input
                    name="content"
                    required
                    maxLength={240}
                    defaultValue={hook.content}
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                  <button type="submit" className="rounded-lg border border-brand-200 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50">
                    Save
                  </button>
                </form>
                <form action={deletePracticeNotificationHook}>
                  <input type="hidden" name="id" value={hook.id} />
                  <button type="submit" title="Delete hook line" className="rounded-lg p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600">
                    <Trash2 size={16} />
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>

        <div className="grid md:grid-cols-2 gap-8">
        {/* Grading Engine Settings */}
        <div className="bg-card border border-border rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700">
              <Server size={20} />
            </div>
            <h2 className="text-xl font-bold">Grading Engine</h2>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border">
              <div>
                <p className="font-bold text-foreground">Mock Grader</p>
                <p className="text-xs text-muted-foreground">Bypass OpenAI and return mock JSON instantly.</p>
              </div>
              <div className="px-3 py-1 bg-brand-100 text-brand-700 font-mono text-xs font-bold rounded">
                {process.env.USE_MOCK_GRADER === "true" ? "ENABLED" : "DISABLED"}
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border">
              <div>
                <p className="font-bold text-foreground">Mock OCR</p>
                <p className="text-xs text-muted-foreground">Bypass Z.AI and return mock text instantly.</p>
              </div>
              <div className="px-3 py-1 bg-brand-100 text-brand-700 font-mono text-xs font-bold rounded">
                {process.env.Z_AI_MOCK === "true" ? "ENABLED" : "DISABLED"}
              </div>
            </div>
            
            <p className="text-xs text-muted-foreground mt-2 italic">
              Note: These settings are currently managed via the `.env.local` file for security.
            </p>
          </div>
        </div>

        {/* Payments Settings */}
        <div className="bg-card border border-border rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center text-green-700">
              <CreditCard size={20} />
            </div>
            <h2 className="text-xl font-bold">Payment Gateway</h2>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border">
              <div>
                <p className="font-bold text-foreground">bKash Environment</p>
                <p className="text-xs text-muted-foreground">Sandbox vs Production API URLs.</p>
              </div>
              <div className="px-3 py-1 bg-gray-100 text-gray-700 font-mono text-xs font-bold rounded">
                {process.env.NEXT_PUBLIC_BKASH_BASE_URL?.includes("sandbox") ? "SANDBOX" : "PRODUCTION"}
              </div>
            </div>
            
            <p className="text-xs text-muted-foreground mt-2 italic">
              Note: These settings are currently managed via the `.env.local` file for security.
            </p>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

function NotificationScheduleField({
  name,
  label,
  description,
  defaultChecked,
  children,
}: {
  name: string;
  label: string;
  description: string;
  defaultChecked: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <label className="flex items-start gap-3">
        <input name={name} type="checkbox" defaultChecked={defaultChecked} className="mt-1 h-4 w-4 accent-green-600" />
        <span>
          <span className="block text-sm font-bold text-foreground">{label}</span>
          <span className="block text-xs leading-5 text-muted-foreground">{description}</span>
        </span>
      </label>
      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
        <Clock size={15} className="text-muted-foreground" />
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}

function NumberField({ name, label, min, max, value }: {
  name: string;
  label: string;
  min: number;
  max: number;
  value: number;
}) {
  return (
    <label className="text-xs font-medium text-muted-foreground">
      {label}
      <input
        name={name}
        type="number"
        required
        min={min}
        max={max}
        defaultValue={value}
        className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}
