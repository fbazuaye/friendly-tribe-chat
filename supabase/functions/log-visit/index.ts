import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function parseUA(ua: string): { device_type: string; browser: string; os: string } {
  const u = (ua || "").toLowerCase();
  let device_type = "desktop";
  if (/ipad|tablet|playbook|silk/.test(u)) device_type = "tablet";
  else if (/mobi|iphone|ipod|android.+mobile|blackberry|iemobile|opera mini/.test(u))
    device_type = "mobile";

  let browser = "Other";
  if (/edg\//.test(u)) browser = "Edge";
  else if (/opr\/|opera/.test(u)) browser = "Opera";
  else if (/chrome\//.test(u) && !/edg\/|opr\//.test(u)) browser = "Chrome";
  else if (/safari\//.test(u) && !/chrome\//.test(u)) browser = "Safari";
  else if (/firefox\//.test(u)) browser = "Firefox";

  let os = "Other";
  if (/windows/.test(u)) os = "Windows";
  else if (/android/.test(u)) os = "Android";
  else if (/iphone|ipad|ipod|ios/.test(u)) os = "iOS";
  else if (/mac os x|macintosh/.test(u)) os = "macOS";
  else if (/linux/.test(u)) os = "Linux";

  return { device_type, browser, os };
}

async function sha256(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function geolocate(ip: string): Promise<{
  country: string | null;
  country_code: string | null;
  region: string | null;
  city: string | null;
}> {
  if (!ip || ip === "unknown" || ip.startsWith("127.") || ip === "::1") {
    return { country: null, country_code: null, region: null, city: null };
  }
  try {
    const r = await fetch(`https://ipapi.co/${ip}/json/`, {
      headers: { "user-agent": "pulse-analytics/1.0" },
    });
    if (r.ok) {
      const j = await r.json();
      if (!j.error) {
        return {
          country: j.country_name || null,
          country_code: j.country_code || null,
          region: j.region || null,
          city: j.city || null,
        };
      }
    }
  } catch (_) {}
  // Fallback
  try {
    const r = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city`,
    );
    if (r.ok) {
      const j = await r.json();
      if (j.status === "success") {
        return {
          country: j.country || null,
          country_code: j.countryCode || null,
          region: j.regionName || null,
          city: j.city || null,
        };
      }
    }
  } catch (_) {}
  return { country: null, country_code: null, region: null, city: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const path = typeof body.path === "string" ? body.path.slice(0, 500) : "/";
    const referrer =
      typeof body.referrer === "string" ? body.referrer.slice(0, 500) : null;
    const session_id =
      typeof body.session_id === "string" ? body.session_id.slice(0, 100) : null;
    const user_id = typeof body.user_id === "string" ? body.user_id : null;
    const organization_id =
      typeof body.organization_id === "string" ? body.organization_id : null;

    const ua = req.headers.get("user-agent") || "";
    // Skip obvious bots
    if (/bot|crawler|spider|crawling|preview|lighthouse|headless/i.test(ua)) {
      return new Response(JSON.stringify({ skipped: "bot" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const xff = req.headers.get("x-forwarded-for") || "";
    const ip =
      req.headers.get("cf-connecting-ip") ||
      xff.split(",")[0].trim() ||
      "unknown";

    const [{ device_type, browser, os }, geo, ip_hash] = await Promise.all([
      Promise.resolve(parseUA(ua)),
      geolocate(ip),
      sha256(ip + "|pulse"),
    ]);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error } = await supabase.from("page_visits").insert({
      path,
      referrer,
      session_id,
      user_id,
      organization_id,
      country: geo.country,
      country_code: geo.country_code,
      region: geo.region,
      city: geo.city,
      device_type,
      browser,
      os,
      user_agent: ua.slice(0, 500),
      ip_hash,
    });

    if (error) console.error("insert error", error);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("log-visit error", e);
    return new Response(JSON.stringify({ ok: false }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
