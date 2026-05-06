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
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      console.error("Auth claims error:", claimsError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's org
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
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
      .eq("user_id", userId)
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

    // Create SMS log (queued)
    const { data: smsLog, error: logError } = await supabase
      .from("sms_logs")
      .insert({
        organization_id: orgId,
        sent_by: userId,
        message,
        recipient_count: phoneNumbers.length,
        status: "queued",
      })
      .select()
      .single();

    if (logError || !smsLog) {
      console.error("Error creating SMS log:", logError);
      return new Response(JSON.stringify({ error: "Failed to create SMS log" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Enqueue SMS delivery jobs in batches of 50
    const SMS_BATCH = 50;
    const batches: string[][] = [];
    for (let i = 0; i < phoneNumbers.length; i += SMS_BATCH) {
      batches.push(phoneNumbers.slice(i, i + SMS_BATCH));
    }
    const jobs = batches.map((batch) => ({
      job_type: "sms",
      parent_id: smsLog.id,
      organization_id: orgId,
      phone_numbers: batch,
      payload: { message },
    }));
    for (let i = 0; i < jobs.length; i += 500) {
      await supabase.from("delivery_jobs").insert(jobs.slice(i, i + 500));
    }

    return new Response(
      JSON.stringify({
        success: true,
        sms_log_id: smsLog.id,
        recipientCount: phoneNumbers.length,
        job_count: batches.length,
        status: "queued",
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
