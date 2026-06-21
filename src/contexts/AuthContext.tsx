import { createContext, useContext } from "react";

interface AuthContextValue {
  onLogout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  return useContext(AuthContext);
}
