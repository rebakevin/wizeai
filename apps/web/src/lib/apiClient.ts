async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!res.ok) {
    throw new Error(`Request to ${path} failed with status ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  connectCanvas(body: { canvasBaseUrl: string; apiToken: string }) {
    return apiFetch<{ connected: boolean }>("/canvas/connect", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  disconnectCanvas() {
    return apiFetch<{ connected: boolean }>("/canvas/disconnect", { method: "POST" });
  },
  getCanvasStatus() {
    return apiFetch<{ connected: boolean }>("/canvas/status");
  },
  connectCalendar(body: { accessToken: string; refreshToken?: string }) {
    return apiFetch<{ connected: boolean }>("/calendar/connect", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  disconnectCalendar() {
    return apiFetch<{ connected: boolean }>("/calendar/disconnect", { method: "POST" });
  },
  getCalendarStatus() {
    return apiFetch<{ connected: boolean }>("/calendar/status");
  },
  connectWhatsapp(body: { phoneNumber: string }) {
    return apiFetch<{ connected: boolean }>("/whatsapp/connect", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  disconnectWhatsapp() {
    return apiFetch<{ connected: boolean }>("/whatsapp/disconnect", { method: "POST" });
  },
  getWhatsappStatus() {
    return apiFetch<{ connected: boolean }>("/whatsapp/status");
  },
};
