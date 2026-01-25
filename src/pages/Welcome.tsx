import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/Logo";
import { ArrowRight, MessageCircle, Users, Sparkles, Shield, Zap, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: MessageCircle,
    title: "Real-time Messaging",
    description: "Instant delivery with read receipts and typing indicators",
  },
  {
    icon: Users,
    title: "Community Groups",
    description: "Create and manage groups with roles and moderation",
  },
  {
    icon: Sparkles,
    title: "AI-Powered",
    description: "Smart replies, moderation, and chat summaries",
  },
  {
    icon: Shield,
    title: "Secure & Private",
    description: "End-to-end security with role-based access",
  },
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "Optimized for speed with offline support",
  },
  {
    icon: Globe,
    title: "Works Everywhere",
    description: "Install on any device - iOS, Android, Desktop",
  },
];

export default function Welcome() {
  const navigate = useNavigate();
  const [activeFeature, setActiveFeature] = useState(0);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-accent/5 pointer-events-none" />
      <div className="absolute top-1/4 -left-32 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-32 w-64 h-64 bg-accent/10 rounded-full blur-3xl" />

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header */}
        <header className="flex items-center justify-between p-4 pt-safe-top">
          <Logo size="md" />
          <Button variant="ghost" size="sm" onClick={() => navigate("/auth")}>
            Sign in
          </Button>
        </header>

        {/* Hero */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
          <div className="animate-float mb-8">
            <div className="w-24 h-24 rounded-3xl bg-gradient-primary flex items-center justify-center shadow-glow">
              <MessageCircle className="w-12 h-12 text-white" />
            </div>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Connect with your{" "}
            <span className="text-gradient">community</span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-md mb-8">
            Fast, secure messaging for communities, groups, and teams. 
            Powered by AI for smarter conversations.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
            <Button
              size="lg"
              className="flex-1 bg-gradient-primary hover:opacity-90 gap-2"
              onClick={() => navigate("/auth")}
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="flex-1"
              onClick={() => navigate("/auth")}
            >
              Sign in
            </Button>
          </div>
        </div>

        {/* Features */}
        <div className="px-6 pb-12">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
            {features.map((feature, index) => (
              <button
                key={feature.title}
                onClick={() => setActiveFeature(index)}
                className={cn(
                  "p-4 rounded-2xl text-left transition-all duration-300",
                  "border border-border/50 hover:border-primary/50",
                  activeFeature === index
                    ? "bg-primary/10 border-primary/50 shadow-glow"
                    : "bg-card/50 hover:bg-card"
                )}
              >
                <feature.icon className={cn(
                  "w-8 h-8 mb-3 transition-colors duration-300",
                  activeFeature === index ? "text-primary" : "text-muted-foreground"
                )} />
                <h3 className="font-semibold text-sm mb-1">{feature.title}</h3>
                <p className="text-xs text-muted-foreground">{feature.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center text-xs text-muted-foreground pb-8 pb-safe-bottom">
          <p>Designed by Frank Bazuaye · Powered by LiveGig Ltd</p>
        </footer>
      </div>
    </div>
  );
}
