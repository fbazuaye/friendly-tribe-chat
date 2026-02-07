import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const atApiKey = Deno.env.get("AFRICASTALKING_API_KEY");

    if (!atApiKey) {
      throw new Error("AFRICASTALKING_API_KEY is not configured");
    }

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's org
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return new Response(JSON.stringify({ error: "No organization found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgId = profile.organization_id;

    // Check admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", orgId)
      .single();

    if (!roleData || !["admin", "super_admin"].includes(roleData.role)) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { message, phoneNumbers } = await req.json();

    if (!message || !phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      return new Response(JSON.stringify({ error: "Message and phone numbers are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log the SMS send attempt
    const { data: smsLog, error: logError } = await supabase
      .from("sms_logs")
      .insert({
        organization_id: orgId,
        sent_by: user.id,
        message,
        recipient_count: phoneNumbers.length,
        status: "sending",
      })
      .select()
      .single();

    if (logError) {
      console.error("Error creating SMS log:", logError);
    }

    // Send via Africa's Talking
    const atUsername = "Sandbox";
    const recipients = phoneNumbers.join(",");

    console.log(`Sending bulk SMS to ${phoneNumbers.length} recipients via Africa's Talking`);

    const formData = new URLSearchParams();
    formData.append("username", atUsername);
    formData.append("to", recipients);
    formData.append("message", message);

    const atResponse = await fetch("https://api.sandbox.africastalking.com/version1/messaging", {
      method: "POST",
      headers: {
        "apiKey": atApiKey,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: formData.toString(),
    });

    const responseText = await atResponse.text();
    let atResult;
    try {
      atResult = JSON.parse(responseText);
    } catch {
      console.error("Non-JSON response from AT:", responseText);
      throw new Error(`Africa's Talking returned non-JSON: ${responseText}`);
    }
    console.log("Africa's Talking response:", JSON.stringify(atResult));

    // Update log with result
    if (smsLog) {
      await supabase
        .from("sms_logs")
        .update({
          status: atResponse.ok ? "sent" : "failed",
          response_data: atResult,
        })
        .eq("id", smsLog.id);
    }

    if (!atResponse.ok) {
      throw new Error(`Africa's Talking API error [${atResponse.status}]: ${JSON.stringify(atResult)}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        recipientCount: phoneNumbers.length,
        result: atResult,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error sending bulk SMS:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
