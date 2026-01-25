import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type TokenActionType =
  | "message_text"
  | "message_media"
  | "ai_summary"
  | "ai_smart_reply"
  | "ai_moderation"
  | "ai_analytics"
  | "broadcast"
  | "voice_note"
  | "file_share";

interface ConsumeRequest {
  action_type: TokenActionType;
  metadata?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !claims?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claims.claims.sub;
    const body: ConsumeRequest = await req.json();
    const { action_type, metadata = {} } = body;

    if (!action_type) {
      return new Response(
        JSON.stringify({ error: "action_type is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing token consumption for user ${userId}, action: ${action_type}`);

    // Get user's organization and token allocation
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .single();

    if (profileError || !profile?.organization_id) {
      return new Response(
        JSON.stringify({ error: "User not in an organization", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const orgId = profile.organization_id;

    // Get action cost - first check org-specific, then global defaults
    const { data: orgCost } = await supabase
      .from("token_action_costs")
      .select("token_cost, is_enabled, admin_only")
      .eq("organization_id", orgId)
      .eq("action_type", action_type)
      .maybeSingle();

    const { data: globalCost } = await supabase
      .from("token_action_costs")
      .select("token_cost, is_enabled, admin_only")
      .is("organization_id", null)
      .eq("action_type", action_type)
      .single();

    const actionConfig = orgCost || globalCost;

    if (!actionConfig) {
      return new Response(
        JSON.stringify({ error: "Unknown action type", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!actionConfig.is_enabled) {
      return new Response(
        JSON.stringify({ error: "This action is disabled", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if admin-only action
    if (actionConfig.admin_only) {
      const { data: userRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("organization_id", orgId)
        .single();

      if (!userRole || !["admin", "super_admin"].includes(userRole.role)) {
        return new Response(
          JSON.stringify({ error: "This action requires admin privileges", success: false }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const tokenCost = actionConfig.token_cost;

    // Get current balance
    const { data: allocation, error: allocError } = await supabase
      .from("user_token_allocations")
      .select("current_balance")
      .eq("user_id", userId)
      .eq("organization_id", orgId)
      .single();

    if (allocError || !allocation) {
      return new Response(
        JSON.stringify({ error: "No token allocation found", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (allocation.current_balance < tokenCost) {
      return new Response(
        JSON.stringify({
          error: "Insufficient token balance",
          success: false,
          required: tokenCost,
          available: allocation.current_balance,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const balanceBefore = allocation.current_balance;
    const balanceAfter = balanceBefore - tokenCost;

    // Deduct tokens
    const { error: updateError } = await supabase
      .from("user_token_allocations")
      .update({ current_balance: balanceAfter })
      .eq("user_id", userId)
      .eq("organization_id", orgId);

    if (updateError) {
      console.error("Failed to deduct tokens:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to deduct tokens", success: false }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log transaction
    await supabase.from("token_transactions").insert({
      organization_id: orgId,
      user_id: userId,
      transaction_type: "consumption",
      amount: tokenCost,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      action_type: action_type,
      metadata: metadata,
    });

    // Update org wallet consumed count
    try {
      await supabase
        .from("organization_wallets")
        .update({ tokens_consumed: allocation.current_balance })
        .eq("organization_id", orgId);
    } catch {
      // Ignore errors updating org wallet
    }

    console.log(`Consumed ${tokenCost} tokens for user ${userId}. New balance: ${balanceAfter}`);

    return new Response(
      JSON.stringify({
        success: true,
        consumed: tokenCost,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in consume-tokens:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", success: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
