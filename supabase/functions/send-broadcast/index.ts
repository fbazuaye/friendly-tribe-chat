import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BROADCAST_TOKEN_COST = 1;

Deno.serve(async (req) => {
  // Handle CORS preflight
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client with user's auth for validation
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Admin client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabaseUser.auth.getClaims(token);
    
    if (claimsError || !claims?.claims) {
      console.error("Auth error:", claimsError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claims.claims.sub as string;
    console.log("User ID:", userId);

    // Parse request body
    const { channel_id, content, message_type = "text" } = await req.json();

    if (!channel_id || !content) {
      return new Response(
        JSON.stringify({ error: "channel_id and content are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Sending broadcast to channel:", channel_id);

    // Verify user owns this channel
    const { data: channel, error: channelError } = await supabaseAdmin
      .from("broadcast_channels")
      .select("id, owner_id, organization_id")
      .eq("id", channel_id)
      .single();

    if (channelError || !channel) {
      console.error("Channel error:", channelError);
      return new Response(
        JSON.stringify({ error: "Channel not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (channel.owner_id !== userId) {
      return new Response(
        JSON.stringify({ error: "Only the channel owner can send broadcasts" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check user's token balance
    const { data: allocation, error: allocError } = await supabaseAdmin
      .from("user_token_allocations")
      .select("current_balance")
      .eq("user_id", userId)
      .eq("organization_id", channel.organization_id)
      .single();

    if (allocError || !allocation) {
      console.error("Allocation error:", allocError);
      return new Response(
        JSON.stringify({ error: "Could not find token allocation" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (allocation.current_balance < BROADCAST_TOKEN_COST) {
      return new Response(
        JSON.stringify({ 
          error: `Insufficient tokens. Need ${BROADCAST_TOKEN_COST}, have ${allocation.current_balance}` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Consume tokens
    const newBalance = allocation.current_balance - BROADCAST_TOKEN_COST;
    const { error: updateError } = await supabaseAdmin
      .from("user_token_allocations")
      .update({ current_balance: newBalance, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("organization_id", channel.organization_id);

    if (updateError) {
      console.error("Token update error:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to consume tokens" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log the transaction
    await supabaseAdmin.from("token_transactions").insert({
      user_id: userId,
      organization_id: channel.organization_id,
      transaction_type: "consumption",
      action_type: "broadcast",
      amount: -BROADCAST_TOKEN_COST,
      balance_before: allocation.current_balance,
      balance_after: newBalance,
      metadata: { channel_id, message_type },
    });

    // Insert the broadcast message
    const { data: message, error: messageError } = await supabaseAdmin
      .from("broadcast_messages")
      .insert({
        channel_id,
        sender_id: userId,
        content,
        message_type,
      })
      .select()
      .single();

    if (messageError) {
      console.error("Message insert error:", messageError);
      return new Response(
        JSON.stringify({ error: "Failed to send broadcast message" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Broadcast sent successfully:", message.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message_id: message.id,
        tokens_consumed: BROADCAST_TOKEN_COST,
        new_balance: newBalance,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
