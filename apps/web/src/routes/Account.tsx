import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/lib/authClient";

const CONNECTIONS = [
  { to: "/connect/canvas", label: "Connect Canvas" },
  { to: "/connect/calendar", label: "Connect Google Calendar" },
  { to: "/connect/whatsapp", label: "Connect WhatsApp" },
];

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
            <Button
              key={connection.to}
              variant="outline"
              nativeButton={false}
              render={<Link to={connection.to} />}
            >
              {connection.label}
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
