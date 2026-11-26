// all backend calls go through here
export const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

// access token is kept only in memory, refresh token in localStorage
let accessToken = null;

export function setAccessToken(t) {
  accessToken = t;
}

export function getAccessToken() {
  return accessToken;
}

export function getRefreshToken() {
  return localStorage.getItem("refreshToken");
}

export function setRefreshToken(t) {
  if (t) localStorage.setItem("refreshToken", t);
  else localStorage.removeItem("refreshToken");
}

// refresh token can be used only once (backend rotates it), so if two requests
// try to refresh at the same time they must share the same request
let refreshPromise = null;

export function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

// try to get a new access token using refresh token
async function doRefresh() {
  const rt = getRefreshToken();
  if (!rt) return false;

  try {
    const res = await fetch(BASE_URL + "/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: rt }),
    });
    const json = await res.json();
    if (res.ok && json.data && json.data.accessToken) {
      accessToken = json.data.accessToken;
      if (json.data.refreshToken) setRefreshToken(json.data.refreshToken);
      return true;
    }
  } catch (err) {
    console.log("refresh failed", err);
  }
  setRefreshToken(null);
  accessToken = null;
  return false;
}

export async function api(path, method = "GET", body = null, retry = true) {
  const headers = { "Content-Type": "application/json" };
  if (accessToken) headers["Authorization"] = "Bearer " + accessToken;

  let res;
  try {
    res = await fetch(BASE_URL + path, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, message: "Cannot connect to server", data: null };
  }

  // token expired -> refresh once and retry
  if (res.status === 401 && retry && getRefreshToken()) {
    const done = await refreshAccessToken();
    if (done) return api(path, method, body, false);
  }

  let json;
  try {
    json = await res.json();
  } catch {
    json = { message: "Something went wrong (" + res.status + ")" };
  }

  const ok = res.ok && json.status !== false && json.success !== false;
  return { ...json, ok: ok, code: res.status };
}
