import { NextRequest, NextResponse } from "next/server";
import { adminMessaging } from "@/lib/firebase-admin";
import { createClient } from "@supabase/supabase-js"; // Use pure supabase-js to bypass auth context for webhooks

// Must define a secure webhook secret in production
const WEBHOOK_SECRET = process.env.SUPABASE_WEBHOOK_SECRET || "dev-secret-123";

export async function POST(req: NextRequest) {
  try {
    // 1. Verify Webhook Signature (Very Important to prevent spam)
    const signature = req.headers.get("x-supabase-signature");
    // Implementation of signature verification depends on library, for now we assume it's valid 
    // or you can check against process.env.SUPABASE_WEBHOOK_SECRET
    
    const payload = await req.json();
    
    // Payload from Supabase Webhook (INSERT on notifications table)
    if (payload.type === "INSERT" && payload.table === "notifications") {
      const { user_id, title, message } = payload.record;

      // 2. Fetch the user's FCM tokens
      // We use the service_role key to bypass RLS since this is a server-to-server request
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("fcm_tokens")
        .eq("id", user_id)
        .single();

      const tokens = profile?.fcm_tokens || [];

      // 3. Send Push Notification via Firebase Admin
      if (tokens.length > 0) {
        const messagePayload = {
          notification: {
            title: title || "IBA Written App",
            body: message,
          },
          tokens: tokens,
        };

        const response = await adminMessaging.sendEachForMulticast(messagePayload);
        console.log(`[FCM Webhook] Successfully sent ${response.successCount} messages; ${response.failureCount} failed.`);
        
        // Optional: Clean up failed tokens (e.g., if a user uninstalled the app)
        if (response.failureCount > 0) {
          const failedTokens: string[] = [];
          response.responses.forEach((resp, idx: number) => {
            if (!resp.success) {
              failedTokens.push(tokens[idx]);
            }
          });
          
          if (failedTokens.length > 0) {
            const validTokens = tokens.filter((t: string) => !failedTokens.includes(t));
            await supabaseAdmin
              .from("profiles")
              .update({ fcm_tokens: validTokens })
              .eq("id", user_id);
          }
        }
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Ignored payload type" }, { status: 400 });
  } catch (error: any) {
    console.error("Webhook processing error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
