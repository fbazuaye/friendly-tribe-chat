import { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TokenBalance } from "@/components/ui/TokenBalance";
import {
  Sparkles,
  Send,
  Bot,
  MessageSquare,
  Zap,
  Shield,
  BarChart3,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";

const AI_CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

const aiFeatures = [
  {
    icon: MessageSquare,
    title: "Smart Replies",
    description: "Get AI-suggested responses",
    tokens: 5,
    prompt: "Suggest 3 smart replies for a community member who is asking about how to get started.",
  },
  {
    icon: Zap,
    title: "Chat Summary",
    description: "Summarize long conversations",
    tokens: 15,
    prompt: "Help me summarize a long community conversation. What format should I share it in?",
  },
  {
    icon: Shield,
    title: "Moderation",
    description: "Auto-detect spam & abuse",
    tokens: 10,
    prompt: "Help me set up content moderation guidelines for my community. What should I watch for?",
  },
  {
    icon: BarChart3,
    title: "Analytics",
    description: "Insights for admins",
    tokens: 20,
    prompt: "What community engagement metrics should I track and how can I improve them?",
  },
];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function AIAssistant() {
  const { toast } = useToast();
  const { refetch: refetchBalance } = useTokenBalance();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    let assistantContent = "";

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      const resp = await fetch(AI_CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          action_type: "ai_smart_reply",
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Request failed" }));
        if (resp.status === 402) {
          toast({ title: "Insufficient tokens", description: err.error || "Not enough tokens for this action.", variant: "destructive" });
        } else if (resp.status === 429) {
          toast({ title: "Rate limited", description: "Too many requests. Please wait a moment.", variant: "destructive" });
        } else {
          toast({ title: "Error", description: err.error || "Something went wrong", variant: "destructive" });
        }
        setIsLoading(false);
        return;
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;
      const assistantId = (Date.now() + 1).toString();

      // Add empty assistant message
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              const snapshot = assistantContent;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: snapshot } : m))
              );
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              const snapshot = assistantContent;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: snapshot } : m))
              );
            }
          } catch {
            /* ignore */
          }
        }
      }

      refetchBalance();
      toast({ title: "Tokens used", description: "AI response generated successfully" });
    } catch (e) {
      console.error("AI chat error:", e);
      toast({ title: "Error", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-5rem)]">
        {/* Header */}
        <header className="sticky top-0 z-40 glass-strong border-b border-border/50">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-semibold">AI Assistant</h1>
                <p className="text-xs text-muted-foreground">Powered by Lovable AI</p>
              </div>
            </div>
            <TokenBalance size="sm" />
          </div>
        </header>

        {/* Features grid (shown when no conversation) */}
        {messages.length === 0 && (
          <div className="p-4 space-y-4">
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-gradient-primary mx-auto flex items-center justify-center mb-4">
                <Bot className="w-8 h-8 text-white" />
              </div>
              <h2 className="font-semibold text-lg mb-2">Welcome to AI Assistant</h2>
              <p className="text-sm text-muted-foreground">
                I can help you with community management, moderation, and more.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {aiFeatures.map((feature) => (
                <button
                  key={feature.title}
                  onClick={() => sendMessage(feature.prompt)}
                  disabled={isLoading}
                  className={cn(
                    "p-4 rounded-xl text-left transition-all",
                    "bg-card border border-border/50",
                    "hover:border-primary/50 hover:bg-primary/5",
                    "disabled:opacity-50"
                  )}
                >
                  <feature.icon className="w-8 h-8 text-primary mb-3" />
                  <h3 className="font-medium text-sm mb-1">{feature.title}</h3>
                  <p className="text-xs text-muted-foreground mb-2">{feature.description}</p>
                  <span className="text-xs text-primary font-medium">{feature.tokens} tokens</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.length > 0 && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3 max-w-[90%] animate-fade-in",
                  message.role === "user" ? "ml-auto flex-row-reverse" : ""
                )}
              >
                {message.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                )}
                <div
                  className={cn(
                    "px-4 py-3 rounded-2xl",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-card border border-border/50 rounded-bl-md"
                  )}
                >
                  {message.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                      <ReactMarkdown>{message.content || "..."}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  )}
                </div>
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-3 animate-fade-in">
                <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="px-4 py-3 bg-card border border-border/50 rounded-2xl rounded-bl-md">
                  <div className="flex gap-1">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Spacer when no messages */}
        {messages.length === 0 && <div className="flex-1" />}

        {/* Input */}
        <div className="p-4 border-t border-border bg-card">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask AI anything..."
              className="flex-1"
              onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
              disabled={isLoading}
            />
            <Button
              size="icon"
              className="bg-gradient-primary hover:opacity-90"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Each AI interaction uses tokens from your balance
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
