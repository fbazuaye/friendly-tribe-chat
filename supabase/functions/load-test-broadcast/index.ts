// Super-admin-only load tester. Generates N fake subscribers on a channel
// and optionally fires a real broadcast through the queue. Fake subscribers
// have no push devices, so they show up as "no-device failures" — which is
// fine: the goal is to measure enqueue + worker throughput.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RPC_CHUNK = 5000;
const MAX_COUNT = 1_000_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(url, service);

    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const channel_id: string | undefined = body.channel_id;
    const count: number = Math.max(0, Math.min(Number(body.count) || 0, MAX_COUNT));
    const send_broadcast: boolean = !!body.send_broadcast;
    const content: string = String(body.content || "Load test broadcast");
    const cleanup: boolean = !!body.cleanup;

    if (!channel_id) return json({ error: "channel_id required" }, 400);

    const { data: channel } = await admin
      .from("broadcast_channels")
      .select("id, owner_id, organization_id, name")
      .eq("id", channel_id)
      .single();
    if (!channel) return json({ error: "Channel not found" }, 404);

    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("organization_id", channel.organization_id)
      .single();
    if (!roleRow || roleRow.role !== "super_admin") {
      return json({ error: "Super-admin only" }, 403);
    }
    if (channel.owner_id !== userId) {
      return json({ error: "Must be channel owner" }, 403);
    }

    const result: Record<string, unknown> = { channel_id, requested: count };
    const t0 = Date.now();

    // 1. Cleanup: delete subscribers on this channel whose user_id has no profile in the org
    if (cleanup) {
      // Get all valid profile IDs for the org (cheap; org membership is bounded)
      const validIds = new Set<string>();
      let from = 0;
      while (true) {
        const { data, error } = await admin
          .from("profiles")
          .select("id")
          .eq("organization_id", channel.organization_id)
          .range(from, from + 999);
        if (error) throw error;
        for (const r of data || []) validIds.add(r.id);
        if (!data || data.length < 1000) break;
        from += 1000;
      }

      // Page through subscribers and delete fakes in chunks
      let deleted = 0;
      let cursor: string | null = null;
      while (true) {
        let q = admin
          .from("broadcast_subscribers")
          .select("id, user_id")
          .eq("channel_id", channel_id)
          .order("id", { ascending: true })
          .limit(5000);
        if (cursor) q = q.gt("id", cursor);
        const { data, error } = await q;
        if (error) throw error;
        if (!data || data.length === 0) break;
        const fakeIds = data.filter((r: any) => !validIds.has(r.user_id)).map((r: any) => r.id);
        if (fakeIds.length > 0) {
          const { error: dErr } = await admin
            .from("broadcast_subscribers")
            .delete()
            .in("id", fakeIds);
          if (dErr) throw dErr;
          deleted += fakeIds.length;
        }
        if (data.length < 5000) break;
        cursor = data[data.length - 1].id;
      }

      // Recompute subscriber_count
      const { count: total } = await admin
        .from("broadcast_subscribers")
        .select("id", { count: "exact", head: true })
        .eq("channel_id", channel_id);
      await admin
        .from("broadcast_channels")
        .update({ subscriber_count: total ?? 0 })
        .eq("id", channel_id);

      result.cleaned_up = deleted;
      result.cleanup_ms = Date.now() - t0;
    }

    // 2. Generate N fake subscriber rows via the existing RPC
    let inserted = 0;
    if (count > 0) {
      const tIns = Date.now();
      for (let i = 0; i < count; i += RPC_CHUNK) {
        const slice = Math.min(RPC_CHUNK, count - i);
        const ids: string[] = new Array(slice);
        for (let k = 0; k < slice; k++) ids[k] = crypto.randomUUID();
        const { data, error } = await userClient.rpc("bulk_subscribe_users", {
          _channel_id: channel_id,
          _user_ids: ids,
        });
        if (error) throw error;
        inserted += Number(data || 0);
      }
      result.inserted_fake_subscribers = inserted;
      result.subscribe_ms = Date.now() - tIns;
    }

    // 3. Optionally fire a broadcast through the queue (no token charge)
    if (send_broadcast) {
      const tSend = Date.now();
      const { data: message, error: msgErr } = await admin
        .from("broadcast_messages")
        .insert({
          channel_id,
          sender_id: userId,
          content,
          message_type: "text",
          total_recipients: 0,
          metadata: { load_test: true },
        })
        .select()
        .single();
      if (msgErr) throw msgErr;

      const { error: seedErr } = await admin.from("delivery_jobs").insert({
        job_type: "enqueue_broadcast",
        parent_id: message.id,
        organization_id: channel.organization_id,
        payload: {
          channel_id,
          owner_id: userId,
          cursor: null,
          page_size: 5000,
          batch_size: 100,
          notification: {
            title: channel.name || "Load test",
            body: content.slice(0, 100),
            url: `/broadcasts/${channel_id}`,
            tag: `loadtest-${channel_id}`,
          },
        },
      });
      if (seedErr) throw seedErr;

      result.broadcast = {
        message_id: message.id,
        seeded_ms: Date.now() - tSend,
        watch_url: `/broadcasts/${channel_id}`,
      };
    }

    result.total_ms = Date.now() - t0;
    return json(result);
  } catch (err) {
    console.error("load-test-broadcast error:", err);
    return json({ error: String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
