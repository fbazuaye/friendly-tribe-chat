import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AllocateRequest {
  target_user_id: string;
  amount: number;
  monthly_quota?: number;
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

    const adminUserId = claims.claims.sub;
    const body: AllocateRequest = await req.json();
    const { target_user_id, amount, monthly_quota } = body;

    if (!target_user_id || amount === undefined) {
      return new Response(
        JSON.stringify({ error: "target_user_id and amount are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (amount < 0) {
      return new Response(
        JSON.stringify({ error: "Amount must be non-negative" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Admin ${adminUserId} allocating ${amount} tokens to user ${target_user_id}`);

    // Get admin's organization
    const { data: adminProfile, error: adminProfileError } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", adminUserId)
      .single();

    if (adminProfileError || !adminProfile?.organization_id) {
      return new Response(
        JSON.stringify({ error: "Admin not in an organization" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const orgId = adminProfile.organization_id;

    // Verify admin has admin/super_admin role
    const { data: adminRole, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", adminUserId)
      .eq("organization_id", orgId)
      .single();

    if (roleError || !adminRole || !["admin", "super_admin"].includes(adminRole.role)) {
      return new Response(
        JSON.stringify({ error: "Insufficient privileges. Admin role required." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify target user is in the same organization
    const { data: targetProfile, error: targetProfileError } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", target_user_id)
      .single();

    if (targetProfileError || targetProfile?.organization_id !== orgId) {
      return new Response(
        JSON.stringify({ error: "Target user not in your organization" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check organization wallet has enough tokens
    const { data: orgWallet, error: walletError } = await supabase
      .from("organization_wallets")
      .select("total_tokens, tokens_allocated")
      .eq("organization_id", orgId)
      .single();

    if (walletError || !orgWallet) {
      return new Response(
        JSON.stringify({ error: "Organization wallet not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const availableTokens = orgWallet.total_tokens - orgWallet.tokens_allocated;
    if (amount > availableTokens) {
      return new Response(
        JSON.stringify({ 
          error: "Insufficient organization tokens",
          available: availableTokens,
          requested: amount 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get or create user allocation
    const { data: existingAllocation } = await supabase
      .from("user_token_allocations")
      .select("current_balance, monthly_quota")
      .eq("user_id", target_user_id)
      .eq("organization_id", orgId)
      .maybeSingle();

    const balanceBefore = existingAllocation?.current_balance ?? 0;
    const balanceAfter = balanceBefore + amount;
    const newQuota = monthly_quota ?? existingAllocation?.monthly_quota ?? amount;

    if (existingAllocation) {
      // Update existing allocation
      const { error: updateError } = await supabase
        .from("user_token_allocations")
        .update({
          current_balance: balanceAfter,
          monthly_quota: newQuota,
          allocated_by: adminUserId,
        })
        .eq("user_id", target_user_id)
        .eq("organization_id", orgId);

      if (updateError) {
        console.error("Failed to update allocation:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to update allocation" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Create new allocation
      const { error: insertError } = await supabase
        .from("user_token_allocations")
        .insert({
          user_id: target_user_id,
          organization_id: orgId,
          current_balance: amount,
          monthly_quota: monthly_quota ?? amount,
          allocated_by: adminUserId,
        });

      if (insertError) {
        console.error("Failed to create allocation:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to create allocation" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Update organization wallet
    const { error: orgUpdateError } = await supabase
      .from("organization_wallets")
      .update({
        tokens_allocated: orgWallet.tokens_allocated + amount,
      })
      .eq("organization_id", orgId);

    if (orgUpdateError) {
      console.error("Failed to update org wallet:", orgUpdateError);
    }

    // Log transaction
    await supabase.from("token_transactions").insert({
      organization_id: orgId,
      user_id: target_user_id,
      transaction_type: "allocation",
      amount: amount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      metadata: {
        allocated_by: adminUserId,
        monthly_quota: newQuota,
      },
    });

    console.log(`Allocated ${amount} tokens to user ${target_user_id}. New balance: ${balanceAfter}`);

    return new Response(
      JSON.stringify({
        success: true,
        allocated: amount,
        balance_after: balanceAfter,
        monthly_quota: newQuota,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in allocate-tokens:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
