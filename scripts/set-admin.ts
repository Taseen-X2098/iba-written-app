import { createClient } from "@supabase/supabase-js";

async function setAdmin() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const targetEmail = "taseen2098@gmail.com";

  console.log(`Looking for user with email: ${targetEmail}`);

  // Need to bypass RLS, querying auth.users requires admin/service_role API
  const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();

  if (authError || !users) {
    console.error("Failed to list users:", authError);
    return;
  }

  const user = users.find((u) => u.email === targetEmail);

  if (!user) {
    console.error(`User with email ${targetEmail} not found in the database. Are you sure you signed up with it?`);
    return;
  }

  console.log(`Found user ID: ${user.id}`);

  // Update profile
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ is_admin: true })
    .eq("id", user.id);

  if (updateError) {
    console.error("Failed to update profile to admin:", updateError);
  } else {
    console.log(`Successfully set is_admin = true for ${targetEmail}!`);
  }
}

setAdmin();
