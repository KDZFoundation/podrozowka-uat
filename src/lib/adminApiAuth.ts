import { auth } from "@/integrations/firebase/config";

/** Adds the current Firebase ID token to requests for privileged server APIs. */
export const adminApiHeaders = async (contentType = false): Promise<HeadersInit> => {
  const user = auth.currentUser;
  if (!user) throw new Error("Zaloguj się ponownie jako administrator.");

  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    ...(contentType ? { "Content-Type": "application/json" } : {}),
  };
};
