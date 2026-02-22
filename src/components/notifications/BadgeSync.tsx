import { useUnreadCount } from "@/hooks/useUnreadCount";
import { useUnreadBroadcastCount } from "@/hooks/useUnreadBroadcastCount";
import { useUnreadCommunityCount } from "@/hooks/useUnreadCommunityCount";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useAuth } from "@/hooks/useAuth";

export function BadgeSync() {
  const { user } = useAuth();
  const unreadChats = useUnreadCount();
  const unreadBroadcasts = useUnreadBroadcastCount();
  const unreadCommunities = useUnreadCommunityCount();
  const totalUnread = user ? unreadChats + unreadBroadcasts + unreadCommunities : 0;

  // This drives the PWA app badge via the hook
  usePushNotifications(totalUnread);

  return null;
}
