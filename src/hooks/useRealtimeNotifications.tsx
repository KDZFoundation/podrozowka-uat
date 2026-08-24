import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { db } from "@/integrations/firebase/config";

const useRealtimeNotifications = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;

    let initialized = false;
    const unsubscribe = onSnapshot(
      query(collection(db, "notifications"), where("user_id", "==", user.id)),
      (snapshot) => {
        if (initialized) {
          snapshot.docChanges().filter((change) => change.type === "added").forEach((change) => {
            const n = change.doc.data() as { title?: string; message?: string };
            toast(n.title || "Nowe powiadomienie", { description: n.message || "" });
          });
        }
        initialized = true;
        queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
        queryClient.invalidateQueries({ queryKey: ["user-stats"] });
        queryClient.invalidateQueries({ queryKey: ["rank-card"] });
        queryClient.invalidateQueries({ queryKey: ["user-ranking"] });
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user, queryClient]);
};

export default useRealtimeNotifications;
