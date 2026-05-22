import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---- Web Push crypto helpers (RFC 8291) ----
function base64UrlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createVapidAuthHeader(endpoint: string, subject: string, pub: string, priv: string) {
  const audience = new URL(endpoint).origin;
  const publicKeyBytes = base64UrlDecode(pub);
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", d: priv, x: base64UrlEncode(publicKeyBytes.slice(1, 33)), y: base64UrlEncode(publicKeyBytes.slice(33, 65)) },
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]
  );
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 12 * 3600, sub: subject };
  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const unsigned = `${headerB64}.${payloadB64}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, new TextEncoder().encode(unsigned));
  const sigBytes = new Uint8Array(sig);
  let r: Uint8Array, s: Uint8Array;
  if (sigBytes.length === 64) { r = sigBytes.slice(0, 32); s = sigBytes.slice(32); }
  else {
    let off = 2;
    const rLen = sigBytes[off + 1]; r = sigBytes.slice(off + 2, off + 2 + rLen);
    off = off + 2 + rLen;
    const sLen = sigBytes[off + 1]; s = sigBytes.slice(off + 2, off + 2 + sLen);
    if (r.length > 32) r = r.slice(r.length - 32);
    if (s.length > 32) s = s.slice(s.length - 32);
    if (r.length < 32) { const t = new Uint8Array(32); t.set(r, 32 - r.length); r = t; }
    if (s.length < 32) { const t = new Uint8Array(32); t.set(s, 32 - s.length); s = t; }
  }
  const raw = new Uint8Array(64); raw.set(r, 0); raw.set(s, 32);
  return `vapid t=${unsigned}.${base64UrlEncode(raw)}, k=${pub}`;
}

async function encryptPayload(payload: string, subPub: string, subAuth: string) {
  const clientPub = base64UrlDecode(subPub);
  const authSecret = base64UrlDecode(subAuth);
  const serverKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const serverPub = new Uint8Array(await crypto.subtle.exportKey("raw", serverKeys.publicKey));
  const clientKey = await crypto.subtle.importKey("raw", clientPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: clientKey }, serverKeys.privateKey, 256));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const authInfo = new TextEncoder().encode("WebPush: info\0");
  const authInfoFull = new Uint8Array(authInfo.length + clientPub.length + serverPub.length);
  authInfoFull.set(authInfo); authInfoFull.set(clientPub, authInfo.length); authInfoFull.set(serverPub, authInfo.length + clientPub.length);
  const prkKey = await crypto.subtle.importKey("raw", shared, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, authSecret));
  const ikmKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const ikm = new Uint8Array(await crypto.subtle.sign("HMAC", ikmKey, new Uint8Array([...authInfoFull, 1])));
  const saltKey = await crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prkCek = new Uint8Array(await crypto.subtle.sign("HMAC", saltKey, ikm));
  const cekInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
  const cekKey = await crypto.subtle.importKey("raw", prkCek, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const cek = new Uint8Array(await crypto.subtle.sign("HMAC", cekKey, new Uint8Array([...cekInfo, 1]))).slice(0, 16);
  const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");
  const nonceKey = await crypto.subtle.importKey("raw", prkCek, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const nonce = new Uint8Array(await crypto.subtle.sign("HMAC", nonceKey, new Uint8Array([...nonceInfo, 1]))).slice(0, 12);
  const padded = new Uint8Array([...new TextEncoder().encode(payload), 2]);
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const enc = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded));
  const recordSize = enc.length + 86;
  const header = new Uint8Array(86);
  header.set(salt, 0);
  header[16] = (recordSize >> 24) & 0xff; header[17] = (recordSize >> 16) & 0xff;
  header[18] = (recordSize >> 8) & 0xff; header[19] = recordSize & 0xff;
  header[20] = 65; header.set(serverPub, 21);
  const body = new Uint8Array(header.length + enc.length);
  body.set(header); body.set(enc, header.length);
  return body;
}

// ---- Worker ----
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  let jobId: string | null = null;
  try {
    const body = await req.json();
    jobId = body.job_id;
    if (!jobId) throw new Error("job_id required");

    const { data: job, error: jobErr } = await supabase
      .from("delivery_jobs")
      .select("*")
      .eq("id", jobId)
      .single();
    if (jobErr || !job) throw new Error("job not found");

    if (job.job_type === "push") {
      const result = await deliverPush(supabase, job);
      await supabase.rpc("complete_delivery_job", {
        _job_id: job.id,
        _success: result.failed === 0 || result.sent > 0,
        _sent: result.sent,
        _failed: result.failed,
        _error: result.error,
      });
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (job.job_type === "sms") {
      const result = await deliverSms(supabase, job);
      await supabase.rpc("complete_delivery_job", {
        _job_id: job.id,
        _success: result.success,
        _sent: result.sent,
        _failed: result.failed,
        _error: result.error,
      });
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (job.job_type === "enqueue_broadcast") {
      const result = await expandBroadcast(supabase, job);
      await supabase.rpc("complete_delivery_job", {
        _job_id: job.id, _success: true, _sent: 0, _failed: 0, _error: null,
      });
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (job.job_type === "enqueue_sms") {
      const result = await expandSms(supabase, job);
      await supabase.rpc("complete_delivery_job", {
        _job_id: job.id, _success: true, _sent: 0, _failed: 0, _error: null,
      });
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    throw new Error(`unknown job_type ${job.job_type}`);
  } catch (err) {
    console.error("deliver-batch error:", err);
    if (jobId) {
      try {
        await supabase.rpc("complete_delivery_job", {
          _job_id: jobId, _success: false, _sent: 0, _failed: 0, _error: String(err),
        });
      } catch (_) { /* ignore */ }
    }
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function deliverPush(supabase: any, job: any) {
  const vapidPub = Deno.env.get("VAPID_PUBLIC_KEY")!;
  const vapidPriv = Deno.env.get("VAPID_PRIVATE_KEY")!;
  const vapidSub = Deno.env.get("VAPID_SUBJECT") || "mailto:noreply@example.com";

  const recipientIds: string[] = job.recipient_user_ids || [];
  if (recipientIds.length === 0) return { sent: 0, failed: 0, error: null };

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("*")
    .in("user_id", recipientIds);

  const payload = JSON.stringify(job.payload || {});
  const userOutcome = new Map<string, boolean>();
  const expired: string[] = [];

  for (const sub of subs || []) {
    let ok = false;
    try {
      const auth = await createVapidAuthHeader(sub.endpoint, vapidSub, vapidPub, vapidPriv);
      const enc = await encryptPayload(payload, sub.p256dh, sub.auth);
      const r = await fetch(sub.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Encoding": "aes128gcm",
          "TTL": "86400",
          "Authorization": auth,
          "Urgency": "high",
        },
        body: enc,
      });
      if (r.status === 201 || r.status === 200) ok = true;
      else if (r.status === 404 || r.status === 410) expired.push(sub.id);
    } catch (e) {
      console.error("push send err:", e);
    }
    const prev = userOutcome.get(sub.user_id);
    userOutcome.set(sub.user_id, prev === true ? true : ok);
  }

  if (expired.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", expired);
  }

  let sent = 0, failed = 0;
  for (const ok of userOutcome.values()) { if (ok) sent++; else failed++; }
  // Recipients without any device count as failed delivery for this batch
  const noDevice = Math.max(0, recipientIds.length - userOutcome.size);
  failed += noDevice;
  return { sent, failed, error: null as string | null };
}

function normalizeE164(raw: string): string | null {
  if (!raw) return null;
  let s = String(raw).trim().replace(/[\s\-()]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  // Nigeria local format (e.g. 0803...) -> +234
  if (/^0\d{10}$/.test(s)) s = "+234" + s.slice(1);
  if (!s.startsWith("+")) s = "+" + s;
  return /^\+\d{8,15}$/.test(s) ? s : null;
}

async function deliverSms(supabase: any, job: any) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
  const MSG_SVC_SID = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID");
  const FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER");

  const phones: string[] = job.phone_numbers || [];
  if (phones.length === 0) return { success: true, sent: 0, failed: 0, error: null };

  if (!LOVABLE_API_KEY) return { success: false, sent: 0, failed: phones.length, error: "LOVABLE_API_KEY missing" };
  if (!TWILIO_API_KEY) return { success: false, sent: 0, failed: phones.length, error: "TWILIO_API_KEY missing (connect Twilio)" };
  if (!FROM_NUMBER && !MSG_SVC_SID) {
    return { success: false, sent: 0, failed: phones.length, error: "No Twilio sender configured: set TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID" };
  }

  const message = String(job.payload?.message ?? "");
  const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  const outcomes: any[] = [];

  const results = await Promise.allSettled(
    phones.map(async (raw) => {
      const to = normalizeE164(raw);
      if (!to) throw new Error(`invalid number: ${raw}`);
      const params: Record<string, string> = { To: to, Body: message };
      if (FROM_NUMBER) params.From = FROM_NUMBER;
      else params.MessagingServiceSid = MSG_SVC_SID!;
      const body = new URLSearchParams(params);
      const r = await fetch(`${GATEWAY_URL}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": TWILIO_API_KEY,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const code = data?.code ?? r.status;
        const msg = data?.message ?? "Twilio error";
        const err = new Error(`[${code}] ${msg}`) as any;
        err.to = to;
        err.code = code;
        throw err;
      }
      return { to, sid: data?.sid, status: data?.status };
    })
  );

  for (const res of results) {
    if (res.status === "fulfilled") {
      sent++;
      outcomes.push({ ok: true, ...res.value });
    } else {
      failed++;
      const reason: any = res.reason;
      outcomes.push({ ok: false, to: reason?.to, code: reason?.code, error: String(reason?.message ?? reason) });
      if (errors.length < 5) errors.push(String(reason?.message ?? reason));
    }
  }

  // Persist per-recipient outcomes onto sms_logs.response_data.recipients
  if (job.parent_id) {
    try {
      const { data: parent } = await supabase
        .from("sms_logs").select("response_data").eq("id", job.parent_id).single();
      const prev = (parent?.response_data ?? {}) as any;
      const recipients = Array.isArray(prev.recipients) ? prev.recipients : [];
      const merged = { ...prev, recipients: recipients.concat(outcomes).slice(-1000) };
      await supabase.from("sms_logs").update({ response_data: merged }).eq("id", job.parent_id);
    } catch (e) {
      console.error("sms_logs response_data update err:", e);
    }
  }

  return {
    success: sent > 0,
    sent,
    failed,
    error: errors.length ? errors.join(" | ").slice(0, 500) : null,
  };
}

// ---- Expanders ----
async function expandBroadcast(supabase: any, job: any) {
  const { channel_id, owner_id, cursor, page_size = 5000, batch_size = 100, notification } = job.payload || {};
  if (!channel_id || !notification) throw new Error("invalid enqueue_broadcast payload");

  let query = supabase
    .from("broadcast_subscribers")
    .select("id, user_id")
    .eq("channel_id", channel_id)
    .neq("user_id", owner_id)
    .order("id", { ascending: true })
    .limit(page_size);

  if (cursor) query = query.gt("id", cursor);

  const { data: subs, error } = await query;
  if (error) throw error;
  const rows = subs || [];
  if (rows.length === 0) {
    // No (more) recipients. If no push jobs exist for this message, mark complete.
    const { count } = await supabase
      .from("delivery_jobs")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", job.parent_id)
      .eq("job_type", "push");
    if (!count) {
      await supabase
        .from("broadcast_messages")
        .update({ delivery_completed_at: new Date().toISOString() })
        .eq("id", job.parent_id);
    }
    return { enqueued: 0, done: true };
  }

  const recipientIds = rows.map((r: any) => r.user_id);
  const pushJobs: any[] = [];
  for (let i = 0; i < recipientIds.length; i += batch_size) {
    pushJobs.push({
      job_type: "push",
      parent_id: job.parent_id,
      organization_id: job.organization_id,
      recipient_user_ids: recipientIds.slice(i, i + batch_size),
      payload: notification,
    });
  }
  // Insert push jobs in chunks of 500
  for (let i = 0; i < pushJobs.length; i += 500) {
    const { error: insErr } = await supabase.from("delivery_jobs").insert(pushJobs.slice(i, i + 500));
    if (insErr) console.error("push jobs insert err:", insErr);
  }

  // Increment total_recipients on broadcast_messages
  const { data: cur } = await supabase
    .from("broadcast_messages")
    .select("total_recipients")
    .eq("id", job.parent_id)
    .single();
  await supabase
    .from("broadcast_messages")
    .update({ total_recipients: (Number(cur?.total_recipients) || 0) + recipientIds.length })
    .eq("id", job.parent_id);

  // If we filled the page, schedule another expander
  if (rows.length === page_size) {
    const lastId = rows[rows.length - 1].id;
    await supabase.from("delivery_jobs").insert({
      job_type: "enqueue_broadcast",
      parent_id: job.parent_id,
      organization_id: job.organization_id,
      payload: { ...job.payload, cursor: lastId },
    });
    return { enqueued: recipientIds.length, done: false };
  }

  return { enqueued: recipientIds.length, done: true };
}

async function expandSms(supabase: any, job: any) {
  const { message, phone_numbers = [], offset = 0, page_size = 5000, batch_size = 50 } = job.payload || {};
  if (!message) throw new Error("invalid enqueue_sms payload");

  const slice = phone_numbers.slice(offset, offset + page_size);
  if (slice.length === 0) return { enqueued: 0, done: true };

  const smsJobs: any[] = [];
  for (let i = 0; i < slice.length; i += batch_size) {
    smsJobs.push({
      job_type: "sms",
      parent_id: job.parent_id,
      organization_id: job.organization_id,
      phone_numbers: slice.slice(i, i + batch_size),
      payload: { message },
    });
  }
  for (let i = 0; i < smsJobs.length; i += 500) {
    const { error: insErr } = await supabase.from("delivery_jobs").insert(smsJobs.slice(i, i + 500));
    if (insErr) console.error("sms jobs insert err:", insErr);
  }

  if (offset + slice.length < phone_numbers.length) {
    await supabase.from("delivery_jobs").insert({
      job_type: "enqueue_sms",
      parent_id: job.parent_id,
      organization_id: job.organization_id,
      payload: { ...job.payload, offset: offset + slice.length },
    });
    return { enqueued: slice.length, done: false };
  }
  return { enqueued: slice.length, done: true };
}
