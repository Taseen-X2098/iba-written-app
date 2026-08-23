"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const hookIdSchema = z.string().uuid();
const hookContentSchema = z.string().trim().min(1).max(240);

function checked(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

export async function saveRetentionNotificationSettings(formData: FormData) {
  const user = await requireAdminUser();
  const parsed = z.object({
    practiceTime: timeSchema,
    examReminderMinutes: z.coerce.number().int().min(5).max(10_080),
    expiryDays: z.coerce.number().int().min(1).max(30),
    lapsedDays: z.coerce.number().int().min(1).max(30),
  }).safeParse({
    practiceTime: formData.get("practiceTime"),
    examReminderMinutes: formData.get("examReminderMinutes"),
    expiryDays: formData.get("expiryDays"),
    lapsedDays: formData.get("lapsedDays"),
  });
  if (!parsed.success) throw new Error("Invalid retention notification settings");

  const admin = createAdminClient();
  const { error } = await admin.from("retention_notification_settings").upsert({
    id: 1,
    practice_enabled: checked(formData, "practiceEnabled"),
    practice_days: [1, 3],
    practice_time: `${parsed.data.practiceTime}:00`,
    exam_reminder_enabled: checked(formData, "examReminderEnabled"),
    exam_reminder_minutes_before: parsed.data.examReminderMinutes,
    subscription_expiry_enabled: checked(formData, "expiryEnabled"),
    subscription_expiry_days_before: parsed.data.expiryDays,
    subscription_lapsed_enabled: checked(formData, "lapsedEnabled"),
    subscription_lapsed_days_after: parsed.data.lapsedDays,
    timezone: "Asia/Dhaka",
    updated_by: user.id,
  });
  if (error) throw error;
  revalidatePath("/admin/settings");
}

export async function addPracticeNotificationHook(formData: FormData) {
  await requireAdminUser();
  const content = hookContentSchema.parse(formData.get("content"));
  const { error } = await createAdminClient()
    .from("practice_notification_hooks")
    .insert({ content, is_active: true });
  if (error) throw error;
  revalidatePath("/admin/settings");
}

export async function updatePracticeNotificationHook(formData: FormData) {
  await requireAdminUser();
  const id = hookIdSchema.parse(formData.get("id"));
  const content = hookContentSchema.parse(formData.get("content"));
  const { error } = await createAdminClient()
    .from("practice_notification_hooks")
    .update({ content, is_active: checked(formData, "isActive") })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/admin/settings");
}

export async function deletePracticeNotificationHook(formData: FormData) {
  await requireAdminUser();
  const id = hookIdSchema.parse(formData.get("id"));
  const { error } = await createAdminClient()
    .from("practice_notification_hooks")
    .delete()
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/admin/settings");
}
