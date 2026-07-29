import { createClient } from "@supabase/supabase-js";

async function grantPlan() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const targetEmail = "tasen.taseen@gmail.com";

  console.log(`Looking for user with email: ${targetEmail}`);

  // Fetch auth users
  const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();

  if (authError || !users) {
    console.error("Failed to list users:", authError);
    return;
  }

  const user = users.find((u) => u.email === targetEmail);

  if (!user) {
    console.error(`User with email ${targetEmail} not found in the database. Please ensure they have signed up.`);
    return;
  }

  console.log(`Found user ID: ${user.id}`);

  // Deactivate any existing subscriptions
  await supabase
    .from("subscriptions")
    .update({ is_active: false })
    .eq("user_id", user.id);

  // Calculate expiration date (1 month from now)
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 1);

  // Insert new Plan 2 subscription
  const { error: insertError } = await supabase
    .from("subscriptions")
    .insert({
      user_id: user.id,
      plan_type: "plan_2",
      tests_remaining: 300,
      extra_tests_purchased: 0,
      starts_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      is_active: true
    });

  if (insertError) {
    console.error("Failed to grant plan:", insertError);
  } else {
    console.log(`Successfully granted Plan 2 (Complete Prep) to ${targetEmail}!`);
  }
}

grantPlan();
