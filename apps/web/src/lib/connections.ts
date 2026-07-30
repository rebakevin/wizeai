import { useQuery } from "@tanstack/react-query";
import { api } from "./apiClient";

export type ConnectionService = "canvas" | "calendar" | "whatsapp";

const STATUS_FN: Record<ConnectionService, () => Promise<{ connected: boolean }>> = {
  canvas: api.getCanvasStatus,
  calendar: api.getCalendarStatus,
  whatsapp: api.getWhatsappStatus,
};

export function connectionStatusKey(service: ConnectionService) {
  return ["connection-status", service] as const;
}

export function useConnectionStatus(service: ConnectionService) {
  return useQuery({
    queryKey: connectionStatusKey(service),
    queryFn: STATUS_FN[service],
  });
}
