// Backfill sms_recipients + delivery status for historical Bulk SMS campaigns.
// - Reads sms_logs.response_data (legacy JSONB) to recover Twilio SIDs / Africa's Talking outcomes
// - Materializes sms_recipients rows (idempotent via unique index on sms_log_id + message_sid)
// - For Twilio SIDs, fetches the current MessageStatus and applies it via apply_sms_status_update
// - Recomputes the aggregate sms_logs.status from the per-recipient counters
//
// POST body: { org_id: uuid, sms_log_id?: uuid, limit?: number }
// Caller must be an org admin (verified server-side).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

function normalizeE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).trim().replace(/[\s\-()]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (/^0\d{10}$/.test(s)) s = "+234" + s.slice(1);
  if (!s.startsWith("+")) s = "+" + s;
  return /^\+\d{8,15}$/.test(s) ? s : null;
}

type LegacyRecipient = {
  phone: string | null;
  sid: string | null;
  status: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

function extractRecipients(responseData: any): LegacyRecipient[] {
  if (!responseData || typeof responseData !== "object") return [];
  const out: LegacyRecipient[] = [];

  // Twilio shape written by deliver-batch: { recipients: [{ ok, to, sid, status, code, error }] }
  if (Array.isArray(responseData.recipients)) {
    for (const r of responseData.recipients) {
      const phone = normalizeE164(r?.to ?? r?.phone ?? r?.number);
      const sid = typeof r?.sid === "string" ? r.sid : null;
      const ok = r?.ok === true;
      out.push({
        phone,
        sid,
        status: ok ? (r?.status || "sent") : "failed",
        errorCode: r?.code != null ? String(r.code) : null,
        errorMessage: typeof r?.error === "string" ? r.error.slice(0, 500) : null,
      });
    }
  }

  // Africa's Talking shape: { SMSMessageData: { Recipients: [{ number, status, statusCode, messageId, cost }] }}
  const at = responseData?.SMSMessageData?.Recipients;
  if (Array.isArray(at)) {
    for (const r of at) {
      const phone = normalizeE164(r?.number);
      const sid = r?.messageId && r.messageId !== "None" ? String(r.messageId) : null;
      const statusRaw = String(r?.status || "").toLowerCase();
      let status = "failed";
      if (statusRaw === "success") status = "sent";
      else if (statusRaw.includes("queue")) status = "queued";
      out.push({
        phone,
        sid,
        status,
        errorCode: r?.statusCode != null ? String(r.statusCode) : null,
        errorMessage: status === "failed" ? String(r?.status || "").slice(0, 500) : null,
      });
    }
  }

  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate caller
    const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await asUser.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const orgId: string | null = body?.org_id ?? null;
    const onlyLogId: string | null = body?.sms_log_id ?? null;
    const limit: number = Math.max(1, Math.min(500, Number(body?.limit ?? 100)));
    if (!orgId) {
      return new Response(JSON.stringify({ error: "org_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(url, service);

    // Verify admin
    const { data: isAdmin } = await supabase.rpc("is_org_admin", {
      _user_id: callerId, _org_id: orgId,
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load candidate sms_logs
    let q = supabase
      .from("sms_logs")
      .select("id, organization_id, status, recipient_count, response_data, created_at")
      .eq("organization_id", orgId)
      .not("response_data", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (onlyLogId) q = q.eq("id", onlyLogId);
    const { data: logs, error: logsErr } = await q;
    if (logsErr) throw logsErr;

    const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const canQueryTwilio = !!(TWILIO_API_KEY && LOVABLE_API_KEY);

    let logsScanned = 0;
    let recipientsInserted = 0;
    let twilioChecked = 0;
    let statusUpdates = 0;
    let logsRecomputed = 0;
    const errors: string[] = [];

    for (const log of logs || []) {
      logsScanned++;
      const recs = extractRecipients(log.response_data);
      if (recs.length === 0) continue;

      // Insert any missing rows (idempotent thanks to unique index on (sms_log_id, message_sid))
      // For rows without a sid we still want to record failed attempts, so do a phone-level
      // duplicate check against existing rows.
      const { data: existing } = await supabase
        .from("sms_recipients")
        .select("phone_number, message_sid")
        .eq("sms_log_id", log.id);
      const existingSids = new Set((existing || []).map((r: any) => r.message_sid).filter(Boolean));
      const existingNoSidPhones = new Set(
        (existing || []).filter((r: any) => !r.message_sid).map((r: any) => r.phone_number)
      );

      const toInsert: any[] = [];
      for (const r of recs) {
        const phone = r.phone || "";
        if (!phone) continue;
        if (r.sid) {
          if (existingSids.has(r.sid)) continue;
        } else {
          if (existingNoSidPhones.has(phone)) continue;
        }
        toInsert.push({
          sms_log_id: log.id,
          organization_id: log.organization_id,
          phone_number: phone,
          message_sid: r.sid,
          status: r.status || "sent",
          error_code: r.errorCode,
          error_message: r.errorMessage,
        });
      }

      if (toInsert.length > 0) {
        for (let i = 0; i < toInsert.length; i += 500) {
          const { error: insErr, count } = await supabase
            .from("sms_recipients")
            .insert(toInsert.slice(i, i + 500), { count: "exact" });
          if (insErr) {
            errors.push(`insert ${log.id}: ${insErr.message}`);
          } else if (count != null) {
            recipientsInserted += count;
          } else {
            recipientsInserted += toInsert.slice(i, i + 500).length;
          }
        }
      }

      // Re-poll Twilio for current status on every SID belonging to this log
      if (canQueryTwilio) {
        const { data: sidRows } = await supabase
          .from("sms_recipients")
          .select("message_sid, status")
          .eq("sms_log_id", log.id)
          .not("message_sid", "is", null);

        const pollable = (sidRows || []).filter((r: any) =>
          r.message_sid && r.message_sid.startsWith("SM") &&
          !["delivered", "undelivered", "failed"].includes(r.status)
        );

        for (const row of pollable) {
          try {
            twilioChecked++;
            const r = await fetch(`${GATEWAY_URL}/Messages/${row.message_sid}.json`, {
              method: "GET",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "X-Connection-Api-Key": TWILIO_API_KEY!,
              },
            });
            if (!r.ok) {
              if (errors.length < 10) errors.push(`twilio ${row.message_sid}: ${r.status}`);
              continue;
            }
            const data = await r.json();
            const raw = String(data?.status || "").toLowerCase();
            const map: Record<string, string> = {
              queued: "queued", accepted: "queued", scheduled: "queued",
              sending: "sent", sent: "sent",
              delivered: "delivered", undelivered: "undelivered",
              failed: "failed", canceled: "failed",
            };
            const mapped = map[raw] || raw;
            if (!mapped) continue;
            const { error: rpcErr } = await supabase.rpc("apply_sms_status_update", {
              _message_sid: row.message_sid,
              _status: mapped,
              _error_code: data?.error_code != null ? String(data.error_code) : null,
              _error_message: data?.error_message ? String(data.error_message).slice(0, 500) : null,
            });
            if (rpcErr) {
              if (errors.length < 10) errors.push(`rpc ${row.message_sid}: ${rpcErr.message}`);
            } else {
              statusUpdates++;
            }
          } catch (e) {
            if (errors.length < 10) errors.push(`twilio ${row.message_sid}: ${String(e)}`);
          }
        }
      }

      // Recompute aggregate status (uses caller's auth via separate client)
      try {
        const { error: rcErr } = await asUser.rpc("recompute_sms_log_status", { _sms_log_id: log.id });
        if (rcErr) {
          if (errors.length < 10) errors.push(`recompute ${log.id}: ${rcErr.message}`);
        } else {
          logsRecomputed++;
        }
      } catch (e) {
        if (errors.length < 10) errors.push(`recompute ${log.id}: ${String(e)}`);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      logsScanned,
      recipientsInserted,
      twilioChecked,
      statusUpdates,
      logsRecomputed,
      errors,
      twilioPollingEnabled: canQueryTwilio,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("sms-backfill-status error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
