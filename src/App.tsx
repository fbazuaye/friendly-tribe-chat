import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Welcome from "./pages/Welcome";
import Auth from "./pages/Auth";
import Chats from "./pages/Chats";
import ChatConversation from "./pages/ChatConversation";
import Communities from "./pages/Communities";
import Broadcasts from "./pages/Broadcasts";
import AIAssistant from "./pages/AIAssistant";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Welcome />} />
          <Route path="/auth" element={<Auth />} />
          
          {/* Main app routes */}
          <Route path="/chats" element={<Chats />} />
          <Route path="/chat/:id" element={<ChatConversation />} />
          <Route path="/chat/new" element={<ChatConversation />} />
          
          <Route path="/communities" element={<Communities />} />
          <Route path="/community/:id" element={<Communities />} />
          
          <Route path="/broadcasts" element={<Broadcasts />} />
          <Route path="/broadcast/:id" element={<Broadcasts />} />
          
          <Route path="/ai" element={<AIAssistant />} />
          
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/*" element={<Profile />} />
          
          {/* Catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
