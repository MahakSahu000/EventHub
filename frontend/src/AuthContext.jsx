import { createContext, useContext, useEffect, useState } from "react";
import { api, setAccessToken, setRefreshToken, getRefreshToken, refreshAccessToken } from "./api";
import { connectSocket, disconnectSocket } from "./socket";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inviteCount, setInviteCount] = useState(0);

  async function loadInviteCount() {
    const res = await api("/teams/invites/me");
    if (res.ok) setInviteCount(res.data.length);
  }

  // on page reload try silent login with refresh token
  useEffect(() => {
    async function init() {
      if (getRefreshToken()) {
        const ok = await refreshAccessToken();
        if (ok) {
          const res = await api("/auth/me");
          if (res.ok) {
            connectSocket();
            setUser(res.data);
            loadInviteCount();
          }
        }
      }
      setLoading(false);
    }
    init();
  }, []);

  async function login(email, password) {
    const res = await api("/auth/login", "POST", { email, password });
    if (res.ok) {
      setAccessToken(res.data.accessToken);
      setRefreshToken(res.data.refreshToken);
      connectSocket();
      setUser(res.data.user);
      loadInviteCount();
    }
    return res;
  }

  async function logout() {
    const rt = getRefreshToken();
    if (rt) await api("/auth/logout", "POST", { refreshToken: rt });
    disconnectSocket();
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
    setInviteCount(0);
  }

  const role = user && user.role ? user.role.toUpperCase() : "";

  return (
    <AuthContext.Provider value={{ user, role, loading, login, logout, inviteCount, loadInviteCount }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
