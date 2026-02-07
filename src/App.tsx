import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { PresenceProvider } from "@/hooks/useUserPresence";
import { NotificationPrompt } from "@/components/notifications/NotificationPrompt";
import { RequireOrganization } from "@/components/auth/RequireOrganization";
import Welcome from "./pages/Welcome";
import Auth from "./pages/Auth";
import JoinOrganization from "./pages/JoinOrganization";
import Chats from "./pages/Chats";
import ChatConversation from "./pages/ChatConversation";
import Communities from "./pages/Communities";
import Broadcasts from "./pages/Broadcasts";
import CreateBroadcast from "./pages/CreateBroadcast";
import BroadcastChannel from "./pages/BroadcastChannel";
import DiscoverChannels from "./pages/DiscoverChannels";
import AIAssistant from "./pages/AIAssistant";
import Profile from "./pages/Profile";
import AdminDashboard from "./pages/AdminDashboard";
import BulkSMS from "./pages/BulkSMS";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <PresenceProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<Welcome />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/join-organization" element={<JoinOrganization />} />
              
              {/* Main app routes - require organization */}
              <Route path="/chats" element={<RequireOrganization><Chats /></RequireOrganization>} />
              <Route path="/chat/:id" element={<RequireOrganization><ChatConversation /></RequireOrganization>} />
              <Route path="/chat/new" element={<RequireOrganization><ChatConversation /></RequireOrganization>} />
              
              <Route path="/communities" element={<RequireOrganization><Communities /></RequireOrganization>} />
              <Route path="/community/:id" element={<RequireOrganization><Communities /></RequireOrganization>} />
              
              <Route path="/broadcasts" element={<RequireOrganization><Broadcasts /></RequireOrganization>} />
              <Route path="/broadcasts/discover" element={<RequireOrganization><DiscoverChannels /></RequireOrganization>} />
              <Route path="/broadcast/create" element={<RequireOrganization><CreateBroadcast /></RequireOrganization>} />
              <Route path="/broadcast/:id" element={<RequireOrganization><BroadcastChannel /></RequireOrganization>} />
              
              <Route path="/ai" element={<RequireOrganization><AIAssistant /></RequireOrganization>} />
              
              <Route path="/profile" element={<RequireOrganization><Profile /></RequireOrganization>} />
              <Route path="/profile/*" element={<RequireOrganization><Profile /></RequireOrganization>} />
              
              {/* Admin routes */}
              <Route path="/admin" element={<RequireOrganization><AdminDashboard /></RequireOrganization>} />
              <Route path="/admin/sms" element={<RequireOrganization><BulkSMS /></RequireOrganization>} />
              
              {/* Catch-all */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            <NotificationPrompt />
          </BrowserRouter>
        </TooltipProvider>
      </PresenceProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
