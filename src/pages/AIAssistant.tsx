import { useState } from "react";
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

const aiFeatures = [
  {
    icon: MessageSquare,
    title: "Smart Replies",
    description: "Get AI-suggested responses",
    tokens: 5,
  },
  {
    icon: Zap,
    title: "Chat Summary",
    description: "Summarize long conversations",
    tokens: 15,
  },
  {
    icon: Shield,
    title: "Moderation",
    description: "Auto-detect spam & abuse",
    tokens: 10,
  },
  {
    icon: BarChart3,
    title: "Analytics",
    description: "Insights for admins",
    tokens: 20,
  },
];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function AIAssistant() {
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content:
        "Hi! I'm your Pulse AI assistant. I can help you with community management, moderation, writing messages, and more. Each interaction uses tokens from your balance. How can I help you today?",
    },
  ]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Simulate AI response
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const aiMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content:
        "I'd be happy to help with that! Based on your community's activity, here are some suggestions:\n\n1. **Engagement tip**: Post during peak hours (7-9 PM) for maximum visibility\n2. **Content idea**: Host a weekly Q&A session\n3. **Growth strategy**: Invite members to share with friends\n\nWould you like me to elaborate on any of these?",
    };

    setMessages((prev) => [...prev, aiMessage]);
    setIsLoading(false);

    toast({
      title: "5 tokens used",
      description: "AI response generated successfully",
    });
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
        {messages.length === 1 && (
          <div className="p-4 grid grid-cols-2 gap-3">
            {aiFeatures.map((feature) => (
              <button
                key={feature.title}
                className={cn(
                  "p-4 rounded-xl text-left transition-all",
                  "bg-card border border-border/50",
                  "hover:border-primary/50 hover:bg-primary/5"
                )}
              >
                <feature.icon className="w-8 h-8 text-primary mb-3" />
                <h3 className="font-medium text-sm mb-1">{feature.title}</h3>
                <p className="text-xs text-muted-foreground mb-2">
                  {feature.description}
                </p>
                <span className="text-xs text-primary font-medium">
                  {feature.tokens} tokens
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Messages */}
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
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          ))}

          {isLoading && (
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
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border bg-card">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask AI anything..."
              className="flex-1"
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              disabled={isLoading}
            />
            <Button
              size="icon"
              className="bg-gradient-primary hover:opacity-90"
              onClick={handleSend}
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
