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

async function deliverSms(supabase: any, job: any) {
  const apiKey = Deno.env.get("AFRICASTALKING_API_KEY");
  const username = Deno.env.get("AFRICASTALKING_USERNAME") || "Sandbox";
  if (!apiKey) return { success: false, sent: 0, failed: (job.phone_numbers || []).length, error: "AT key missing" };

  const phones: string[] = job.phone_numbers || [];
  if (phones.length === 0) return { success: true, sent: 0, failed: 0, error: null };

  const isSandbox = username === "Sandbox";
  const apiUrl = isSandbox
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";

  const formData = new URLSearchParams();
  formData.append("username", username);
  formData.append("to", phones.join(","));
  formData.append("message", String(job.payload?.message ?? ""));

  const resp = await fetch(apiUrl, {
    method: "POST",
    headers: { apiKey, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: formData.toString(),
  });
  const text = await resp.text();
  if (!resp.ok) return { success: false, sent: 0, failed: phones.length, error: text.slice(0, 500) };
  return { success: true, sent: phones.length, failed: 0, error: null };
}
