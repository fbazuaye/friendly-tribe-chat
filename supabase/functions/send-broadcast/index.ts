import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BROADCAST_TOKEN_COST = 1;
const PUSH_BATCH_SIZE = 500;

Deno.serve(async (req) => {
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

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabaseUser.auth.getClaims(token);

    if (claimsError || !claims?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claims.claims.sub as string;
    const { channel_id, content, message_type = "text" } = await req.json();

    if (!channel_id || !content) {
      return new Response(
        JSON.stringify({ error: "channel_id and content are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user owns this channel
    const { data: channel, error: channelError } = await supabaseAdmin
      .from("broadcast_channels")
      .select("id, owner_id, organization_id, name")
      .eq("id", channel_id)
      .single();

    if (channelError || !channel) {
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

    // Check token balance
    const { data: allocation, error: allocError } = await supabaseAdmin
      .from("user_token_allocations")
      .select("current_balance")
      .eq("user_id", userId)
      .eq("organization_id", channel.organization_id)
      .single();

    if (allocError || !allocation) {
      return new Response(
        JSON.stringify({ error: "Could not find token allocation" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (allocation.current_balance < BROADCAST_TOKEN_COST) {
      return new Response(
        JSON.stringify({ error: `Insufficient tokens. Need ${BROADCAST_TOKEN_COST}, have ${allocation.current_balance}` }),
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
      return new Response(
        JSON.stringify({ error: "Failed to consume tokens" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log transaction
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

    // Compute audience size (subscribers minus owner)
    const { count: audienceCount } = await supabaseAdmin
      .from("broadcast_subscribers")
      .select("*", { count: "exact", head: true })
      .eq("channel_id", channel_id)
      .neq("user_id", userId);

    // Insert the broadcast message
    const { data: message, error: messageError } = await supabaseAdmin
      .from("broadcast_messages")
      .insert({
        channel_id,
        sender_id: userId,
        content,
        message_type,
        total_recipients: audienceCount ?? 0,
      })
      .select()
      .single();

    if (messageError) {
      return new Response(
        JSON.stringify({ error: "Failed to send broadcast message" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Broadcast sent successfully:", message.id);

    // Return response immediately — push fan-out happens in background
    const response = new Response(
      JSON.stringify({
        success: true,
        message_id: message.id,
        tokens_consumed: BROADCAST_TOKEN_COST,
        new_balance: newBalance,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

    // Async push notification fan-out (runs after response is sent)
    const pushFanout = async () => {
      let totalSent = 0;
      let totalFailed = 0;
      try {
        const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            type: "broadcast",
            record: {
              channel_id,
              sender_id: userId,
              content,
            },
          }),
        });
        if (pushRes.ok) {
          const json = await pushRes.json().catch(() => ({}));
          totalSent = Number(json?.sent ?? 0);
          totalFailed = Number(json?.failed ?? 0);
        }
        console.log(`Push fan-out complete for broadcast ${message.id}: sent=${totalSent} failed=${totalFailed}`);
      } catch (fanoutErr) {
        console.error("Push fan-out error:", fanoutErr);
      } finally {
        try {
          await supabaseAdmin
            .from("broadcast_messages")
            .update({
              push_sent_count: totalSent,
              push_failed_count: totalFailed,
              delivery_completed_at: new Date().toISOString(),
            })
            .eq("id", message.id);
        } catch (updErr) {
          console.error("Failed to update delivery stats:", updErr);
        }
      }
    };

    // Use EdgeRuntime.waitUntil if available, otherwise setTimeout
    if (typeof (globalThis as any).EdgeRuntime?.waitUntil === "function") {
      (globalThis as any).EdgeRuntime.waitUntil(pushFanout());
    } else {
      // Fallback: fire-and-forget — Deno will keep the isolate alive for pending promises
      pushFanout();
    }

    return response;
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
