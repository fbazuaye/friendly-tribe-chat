import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLAIM_LIMIT = 200;
const PARALLEL = 25;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const workerId = `dispatch-${crypto.randomUUID().slice(0, 8)}`;
    const { data: jobs, error } = await supabase.rpc("claim_delivery_jobs", {
      _limit: CLAIM_LIMIT,
      _worker_id: workerId,
    });

    if (error) {
      console.error("claim_delivery_jobs error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const claimed = jobs || [];
    if (claimed.length === 0) {
      return new Response(JSON.stringify({ dispatched: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Bounded parallel fan-out
    const invoke = (job: any) =>
      fetch(`${supabaseUrl}/functions/v1/deliver-batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ job_id: job.id }),
      }).catch((e) => console.error("dispatch fetch err:", e));

    for (let i = 0; i < claimed.length; i += PARALLEL) {
      await Promise.allSettled(claimed.slice(i, i + PARALLEL).map(invoke));
    }

    return new Response(JSON.stringify({ dispatched: claimed.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("dispatch-jobs error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
