import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BROADCAST_TOKEN_COST = 1;
const RECIPIENT_BATCH_SIZE = 100;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claims.claims.sub as string;
    const { channel_id, content, message_type = "text" } = await req.json();

    if (!channel_id || !content) {
      return new Response(JSON.stringify({ error: "channel_id and content are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: channel, error: channelError } = await supabaseAdmin
      .from("broadcast_channels")
      .select("id, owner_id, organization_id, name")
      .eq("id", channel_id)
      .single();

    if (channelError || !channel) {
      return new Response(JSON.stringify({ error: "Channel not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (channel.owner_id !== userId) {
      return new Response(JSON.stringify({ error: "Only the channel owner can send broadcasts" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: allocation } = await supabaseAdmin
      .from("user_token_allocations")
      .select("current_balance")
      .eq("user_id", userId)
      .eq("organization_id", channel.organization_id)
      .single();

    if (!allocation || allocation.current_balance < BROADCAST_TOKEN_COST) {
      return new Response(JSON.stringify({ error: `Insufficient tokens` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newBalance = allocation.current_balance - BROADCAST_TOKEN_COST;
    await supabaseAdmin
      .from("user_token_allocations")
      .update({ current_balance: newBalance, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("organization_id", channel.organization_id);

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

    // Insert broadcast message with total_recipients=0; expander will increment.
    const { data: message, error: messageError } = await supabaseAdmin
      .from("broadcast_messages")
      .insert({
        channel_id,
        sender_id: userId,
        content,
        message_type,
        total_recipients: 0,
      })
      .select()
      .single();

    if (messageError) {
      return new Response(JSON.stringify({ error: "Failed to create broadcast message" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Seed a single expander job. deliver-batch will page subscribers and emit push jobs.
    const { error: seedErr } = await supabaseAdmin.from("delivery_jobs").insert({
      job_type: "enqueue_broadcast",
      parent_id: message.id,
      organization_id: channel.organization_id,
      payload: {
        channel_id,
        owner_id: userId,
        cursor: null,
        page_size: 5000,
        batch_size: RECIPIENT_BATCH_SIZE,
        notification: {
          title: channel.name || "Broadcast",
          body: String(content).slice(0, 100),
          url: `/broadcasts/${channel_id}`,
          tag: `broadcast-${channel_id}`,
        },
      },
    });
    if (seedErr) {
      console.error("seed enqueue_broadcast error:", seedErr);
      // Refund token and remove orphan message so the UI surfaces a real failure
      await supabaseAdmin.from("broadcast_messages").delete().eq("id", message.id);
      await supabaseAdmin
        .from("user_token_allocations")
        .update({ current_balance: allocation.current_balance, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("organization_id", channel.organization_id);
      await supabaseAdmin.from("token_transactions").insert({
        user_id: userId,
        organization_id: channel.organization_id,
        transaction_type: "refund",
        action_type: "broadcast",
        amount: BROADCAST_TOKEN_COST,
        balance_before: newBalance,
        balance_after: allocation.current_balance,
        metadata: { channel_id, reason: "seed_job_failed", error: seedErr.message },
      });
      return new Response(JSON.stringify({ error: `Failed to queue broadcast: ${seedErr.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message_id: message.id,
      tokens_consumed: BROADCAST_TOKEN_COST,
      new_balance: newBalance,
      status: "queued",
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("send-broadcast error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
