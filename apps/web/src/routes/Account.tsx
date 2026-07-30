import { Link } from "react-router";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/lib/authClient";
import { useConnectionStatus, type ConnectionService } from "@/lib/connections";

interface ConnectionConfig {
  service: ConnectionService;
  to: string;
  label: string;
  connectedLabel: string;
}

const CONNECTIONS: ConnectionConfig[] = [
  { service: "canvas", to: "/connect/canvas", label: "Connect Canvas", connectedLabel: "Canvas" },
  {
    service: "calendar",
    to: "/connect/calendar",
    label: "Connect Google Calendar",
    connectedLabel: "Google Calendar",
  },
  {
    service: "whatsapp",
    to: "/connect/whatsapp",
    label: "Connect WhatsApp",
    connectedLabel: "WhatsApp",
  },
];

function ConnectionRow({ service, to, label, connectedLabel }: ConnectionConfig) {
  const { data } = useConnectionStatus(service);

  if (data?.connected) {
    return (
      <div className="flex h-8 items-center justify-between rounded-lg border border-green-500 pl-2.5 pr-1.5 text-green-600 dark:border-green-400 dark:text-green-500">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Check className="size-4" />
          {connectedLabel} connected
        </span>
        <Button variant="secondary" size="xs" nativeButton={false} render={<Link to={to} />}>
          Manage connection
        </Button>
      </div>
    );
  }

  return (
    <Button variant="outline" nativeButton={false} render={<Link to={to} />}>
      {label}
    </Button>
  );
}

export function Account() {
  const { data: session } = useSession();

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>{session?.user.name}</p>
          <p>{session?.user.email}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Connections</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {CONNECTIONS.map((connection) => (
            <ConnectionRow key={connection.service} {...connection} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
