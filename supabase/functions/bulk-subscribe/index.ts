import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RPC_CHUNK = 5000;

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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const body = await req.json();
    const { channel_id, mode } = body || {};
    if (!channel_id || !mode) {
      return new Response(JSON.stringify({ error: "channel_id and mode required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify channel ownership
    const { data: channel } = await admin
      .from("broadcast_channels")
      .select("id, owner_id, organization_id")
      .eq("id", channel_id)
      .single();
    if (!channel || channel.owner_id !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve target user IDs based on mode
    let userIds: string[] = [];

    if (mode === "all_org_members") {
      // Page through org profiles
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await admin
          .from("profiles")
          .select("id")
          .eq("organization_id", channel.organization_id)
          .neq("id", userId)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        userIds.push(...data.map((p: any) => p.id));
        if (data.length < pageSize) break;
        from += pageSize;
      }
    } else if (mode === "user_ids") {
      const ids = Array.isArray(body.user_ids) ? body.user_ids : [];
      userIds = ids.filter((u: any) => typeof u === "string");
    } else {
      return new Response(JSON.stringify({ error: "Unknown mode" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Dedup
    userIds = Array.from(new Set(userIds));
    let inserted = 0;
    for (let i = 0; i < userIds.length; i += RPC_CHUNK) {
      const slice = userIds.slice(i, i + RPC_CHUNK);
      const { data, error } = await userClient.rpc("bulk_subscribe_users", {
        _channel_id: channel_id,
        _user_ids: slice,
      });
      if (error) throw error;
      inserted += Number(data || 0);
    }

    return new Response(
      JSON.stringify({ success: true, requested: userIds.length, inserted }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("bulk-subscribe error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
