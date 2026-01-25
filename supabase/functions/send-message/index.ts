import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendMessageRequest {
  conversation_id?: string;
  recipient_id?: string; // For creating new conversations
  content: string;
  message_type?: "text" | "media" | "voice";
  metadata?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // User client for auth verification
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Service client for database operations
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authError } = await userClient.auth.getClaims(token);
    if (authError || !claims?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claims.claims.sub;
    const body: SendMessageRequest = await req.json();
    const { conversation_id, recipient_id, content, message_type = "text", metadata = {} } = body;

    if (!content?.trim()) {
      return new Response(
        JSON.stringify({ error: "Message content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`User ${userId} sending message, conversation: ${conversation_id}, recipient: ${recipient_id}`);

    // Get user's organization
    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .single();

    if (profileError || !profile?.organization_id) {
      return new Response(
        JSON.stringify({ error: "User not in an organization" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const orgId = profile.organization_id;
    let targetConversationId = conversation_id;

    // If no conversation_id, find or create conversation with recipient
    if (!targetConversationId && recipient_id) {
      // Check if recipient is in same org
      const { data: recipientProfile } = await serviceClient
        .from("profiles")
        .select("organization_id")
        .eq("id", recipient_id)
        .single();

      if (!recipientProfile || recipientProfile.organization_id !== orgId) {
        return new Response(
          JSON.stringify({ error: "Recipient not found in your organization" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Find existing 1:1 conversation
      const { data: existingConversations } = await serviceClient
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", userId);

      if (existingConversations) {
        for (const cp of existingConversations) {
          const { data: participants } = await serviceClient
            .from("conversation_participants")
            .select("user_id")
            .eq("conversation_id", cp.conversation_id);

          if (participants?.length === 2) {
            const participantIds = participants.map((p) => p.user_id);
            if (participantIds.includes(userId) && participantIds.includes(recipient_id)) {
              // Check if it's not a group chat
              const { data: conv } = await serviceClient
                .from("conversations")
                .select("is_group")
                .eq("id", cp.conversation_id)
                .single();

              if (conv && !conv.is_group) {
                targetConversationId = cp.conversation_id;
                break;
              }
            }
          }
        }
      }

      // Create new conversation if not found
      if (!targetConversationId) {
        const { data: newConv, error: convError } = await serviceClient
          .from("conversations")
          .insert({
            organization_id: orgId,
            is_group: false,
          })
          .select("id")
          .single();

        if (convError || !newConv) {
          console.error("Failed to create conversation:", convError);
          return new Response(
            JSON.stringify({ error: "Failed to create conversation" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        targetConversationId = newConv.id;

        // Add both participants
        await serviceClient.from("conversation_participants").insert([
          { conversation_id: targetConversationId, user_id: userId },
          { conversation_id: targetConversationId, user_id: recipient_id },
        ]);

        console.log(`Created new conversation ${targetConversationId} between ${userId} and ${recipient_id}`);
      }
    }

    if (!targetConversationId) {
      return new Response(
        JSON.stringify({ error: "No conversation specified" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user is participant
    const { data: participant } = await serviceClient
      .from("conversation_participants")
      .select("id")
      .eq("conversation_id", targetConversationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!participant) {
      return new Response(
        JSON.stringify({ error: "You are not a participant in this conversation" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine token action type
    const actionType = message_type === "media" ? "message_media" : message_type === "voice" ? "voice_note" : "message_text";

    // Consume tokens via the consume-tokens function logic
    const { data: actionConfig } = await serviceClient
      .from("token_action_costs")
      .select("token_cost, is_enabled")
      .or(`organization_id.eq.${orgId},organization_id.is.null`)
      .eq("action_type", actionType)
      .order("organization_id", { nullsFirst: false })
      .limit(1)
      .single();

    if (!actionConfig?.is_enabled) {
      return new Response(
        JSON.stringify({ error: "This message type is disabled" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenCost = actionConfig.token_cost;

    // Get current balance
    const { data: allocation } = await serviceClient
      .from("user_token_allocations")
      .select("current_balance")
      .eq("user_id", userId)
      .eq("organization_id", orgId)
      .single();

    if (!allocation || allocation.current_balance < tokenCost) {
      return new Response(
        JSON.stringify({
          error: "Insufficient token balance",
          required: tokenCost,
          available: allocation?.current_balance || 0,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const balanceBefore = allocation.current_balance;
    const balanceAfter = balanceBefore - tokenCost;

    // Deduct tokens
    await serviceClient
      .from("user_token_allocations")
      .update({ current_balance: balanceAfter })
      .eq("user_id", userId)
      .eq("organization_id", orgId);

    // Log token transaction
    await serviceClient.from("token_transactions").insert({
      organization_id: orgId,
      user_id: userId,
      transaction_type: "consumption",
      amount: tokenCost,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      action_type: actionType,
      metadata: { conversation_id: targetConversationId, ...metadata },
    });

    // Insert the message
    const { data: message, error: msgError } = await serviceClient
      .from("messages")
      .insert({
        conversation_id: targetConversationId,
        sender_id: userId,
        content: content.trim(),
        message_type,
        metadata,
      })
      .select("*")
      .single();

    if (msgError) {
      console.error("Failed to insert message:", msgError);
      return new Response(
        JSON.stringify({ error: "Failed to send message" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update conversation timestamp
    await serviceClient
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", targetConversationId);

    console.log(`Message sent successfully. Consumed ${tokenCost} tokens. New balance: ${balanceAfter}`);

    return new Response(
      JSON.stringify({
        success: true,
        message,
        conversation_id: targetConversationId,
        tokens_consumed: tokenCost,
        balance_after: balanceAfter,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-message:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
