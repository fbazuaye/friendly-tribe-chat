import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TokenBalance } from "@/components/ui/TokenBalance";
import {
  User,
  Bell,
  Lock,
  Palette,
  HelpCircle,
  LogOut,
  ChevronRight,
  Camera,
  Edit2,
  Shield,
  Coins,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

const menuItems = [
  {
    icon: User,
    label: "Account",
    description: "Manage your profile and settings",
    path: "/profile/account",
  },
  {
    icon: Coins,
    label: "Token Wallet",
    description: "View balance and purchase tokens",
    path: "/profile/tokens",
    badge: "1,250",
  },
  {
    icon: Bell,
    label: "Notifications",
    description: "Push notifications and sounds",
    path: "/profile/notifications",
  },
  {
    icon: Lock,
    label: "Privacy",
    description: "Block list, last seen, read receipts",
    path: "/profile/privacy",
  },
  {
    icon: Shield,
    label: "Security",
    description: "App lock, two-factor auth",
    path: "/profile/security",
  },
  {
    icon: Palette,
    label: "Appearance",
    description: "Theme, font size, chat bubbles",
    path: "/profile/appearance",
  },
  {
    icon: HelpCircle,
    label: "Help & Support",
    description: "FAQ, contact us, report issue",
    path: "/profile/help",
  },
];

export default function Profile() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogout = () => {
    toast({
      title: "Logged out",
      description: "You have been logged out successfully",
    });
    navigate("/");
  };

  return (
    <AppLayout>
      {/* Header */}
      <header className="glass-strong border-b border-border/50">
        <div className="px-4 py-3">
          <h1 className="text-2xl font-bold text-gradient">Profile</h1>
        </div>
      </header>

      {/* Profile card */}
      <div className="p-6">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="relative mb-4">
            <Avatar className="w-24 h-24">
              <AvatarImage src="" />
              <AvatarFallback className="text-2xl bg-gradient-primary text-white">
                JD
              </AvatarFallback>
            </Avatar>
            <button className="absolute bottom-0 right-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground shadow-lg">
              <Camera className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl font-semibold">John Doe</h2>
            <button className="text-muted-foreground hover:text-foreground">
              <Edit2 className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground mb-4">john.doe@example.com</p>
          
          <TokenBalance showTopUp onTopUp={() => navigate("/profile/tokens")} />
        </div>

        {/* Menu items */}
        <div className="space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-xl transition-all",
                "bg-card hover:bg-secondary/50 active:scale-[0.98]"
              )}
            >
              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                <item.icon className="w-5 h-5 text-foreground" />
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{item.label}</span>
                  {item.badge && (
                    <span className="token-pill text-xs py-0.5 px-2">
                      {item.badge}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {item.description}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </div>

        {/* Logout */}
        <Button
          variant="ghost"
          className="w-full mt-6 text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
          onClick={handleLogout}
        >
          <LogOut className="w-5 h-5" />
          Log out
        </Button>

        {/* Version */}
        <p className="text-center text-xs text-muted-foreground mt-8">
          Pulse Community v1.0.0
        </p>
      </div>
    </AppLayout>
  );
}
