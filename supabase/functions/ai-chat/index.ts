import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claims.claims.sub as string;
    const { messages, action_type = "ai_smart_reply" } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Token consumption (reuses consume-tokens logic inline) ---
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .single();

    if (!profile?.organization_id) {
      return new Response(JSON.stringify({ error: "User not in an organization" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgId = profile.organization_id;

    // Get action cost
    const { data: orgCost } = await supabase
      .from("token_action_costs")
      .select("token_cost, is_enabled, admin_only")
      .eq("organization_id", orgId)
      .eq("action_type", action_type)
      .maybeSingle();

    const { data: globalCost } = await supabase
      .from("token_action_costs")
      .select("token_cost, is_enabled, admin_only")
      .is("organization_id", null)
      .eq("action_type", action_type)
      .single();

    const actionConfig = orgCost || globalCost;

    if (!actionConfig) {
      return new Response(JSON.stringify({ error: "Unknown action type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!actionConfig.is_enabled) {
      return new Response(JSON.stringify({ error: "This action is disabled" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (actionConfig.admin_only) {
      const { data: userRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("organization_id", orgId)
        .single();

      if (!userRole || !["admin", "super_admin"].includes(userRole.role)) {
        return new Response(JSON.stringify({ error: "This action requires admin privileges" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const tokenCost = actionConfig.token_cost;

    const { data: allocation } = await supabase
      .from("user_token_allocations")
      .select("current_balance")
      .eq("user_id", userId)
      .eq("organization_id", orgId)
      .single();

    if (!allocation) {
      return new Response(JSON.stringify({ error: "No token allocation found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (allocation.current_balance < tokenCost) {
      return new Response(
        JSON.stringify({
          error: "Insufficient token balance",
          required: tokenCost,
          available: allocation.current_balance,
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const balanceBefore = allocation.current_balance;
    const balanceAfter = balanceBefore - tokenCost;

    // Deduct tokens
    const { error: updateError } = await supabase
      .from("user_token_allocations")
      .update({ current_balance: balanceAfter })
      .eq("user_id", userId)
      .eq("organization_id", orgId);

    if (updateError) {
      console.error("Failed to deduct tokens:", updateError);
      return new Response(JSON.stringify({ error: "Failed to deduct tokens" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log transaction
    await supabase.from("token_transactions").insert({
      organization_id: orgId,
      user_id: userId,
      transaction_type: "consumption",
      amount: tokenCost,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      action_type: action_type,
      metadata: { source: "ai_assistant" },
    });

    console.log(`Consumed ${tokenCost} tokens for user ${userId}. Calling AI gateway...`);

    // --- Call Lovable AI Gateway with streaming ---
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful AI assistant for a community management platform. You help with smart replies, chat summaries, content moderation advice, and community analytics. Be concise, friendly, and practical. Use markdown formatting when helpful (lists, bold, code blocks, etc.).",
          },
          ...messages.map((m: { role: string; content: string }) => ({
            role: m.role,
            content: m.content,
          })),
        ],
        stream: true,
      }),
    });

    if (!aiResponse.ok) {
      // Refund tokens on AI failure
      await supabase
        .from("user_token_allocations")
        .update({ current_balance: balanceBefore })
        .eq("user_id", userId)
        .eq("organization_id", orgId);

      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "AI rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI service unavailable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Stream the AI response back to client
    return new Response(aiResponse.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("ai-chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
