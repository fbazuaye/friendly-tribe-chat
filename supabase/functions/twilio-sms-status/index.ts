// Twilio SMS status callback receiver.
// Twilio POSTs application/x-www-form-urlencoded with MessageSid, MessageStatus, ErrorCode, ErrorMessage.
// We look up sms_recipients by MessageSid and update status/rollups via RPC.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-twilio-signature",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const expected = Deno.env.get("SMS_STATUS_CALLBACK_TOKEN");
    if (expected && url.searchParams.get("t") !== expected) {
      return new Response("forbidden", { status: 403, headers: corsHeaders });
    }

    const ct = req.headers.get("content-type") || "";
    let params: URLSearchParams;
    if (ct.includes("application/x-www-form-urlencoded")) {
      params = new URLSearchParams(await req.text());
    } else if (ct.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      params = new URLSearchParams();
      for (const [k, v] of Object.entries(body)) params.set(k, String(v));
    } else {
      params = new URLSearchParams(await req.text());
    }

    const sid = params.get("MessageSid") || params.get("SmsSid");
    const rawStatus = (params.get("MessageStatus") || params.get("SmsStatus") || "").toLowerCase();
    const errorCode = params.get("ErrorCode") || null;
    const errorMessage = params.get("ErrorMessage") || null;

    if (!sid || !rawStatus) {
      return new Response("missing fields", { status: 400, headers: corsHeaders });
    }

    // Map Twilio status to our enum-ish set
    const map: Record<string, string> = {
      queued: "queued",
      accepted: "queued",
      scheduled: "queued",
      sending: "sent",
      sent: "sent",
      delivered: "delivered",
      undelivered: "undelivered",
      failed: "failed",
      canceled: "failed",
    };
    const status = map[rawStatus] || rawStatus;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error } = await supabase.rpc("apply_sms_status_update", {
      _message_sid: sid,
      _status: status,
      _error_code: errorCode,
      _error_message: errorMessage,
    });
    if (error) console.error("apply_sms_status_update error:", error);

    return new Response("ok", { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("twilio-sms-status error:", e);
    return new Response("error", { status: 500, headers: corsHeaders });
  }
});
