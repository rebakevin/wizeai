import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BackLink } from "@/components/BackLink";
import { authClient } from "@/lib/authClient";
import { connectionStatusKey, useConnectionStatus } from "@/lib/connections";

const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export function ConnectCalendar() {
  const queryClient = useQueryClient();
  const status = useConnectionStatus("calendar");

  const connectMutation = useMutation({
    mutationFn: () =>
      authClient.linkSocial({
        provider: "google",
        scopes: [GOOGLE_CALENDAR_SCOPE],
        callbackURL: `${window.location.origin}/connect/calendar`,
      }),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => authClient.unlinkAccount({ providerId: "google" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: connectionStatusKey("calendar") });
    },
  });

  if (status.data?.connected) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <Card>
          <CardHeader>
            <CardTitle>Google Calendar</CardTitle>
            <CardDescription>
              Wize AI can schedule study sessions on your calendar.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-500">
              <Check className="size-4" />
              Google Calendar connected
            </p>
            {disconnectMutation.isError && (
              <p className="text-sm text-destructive">Could not disconnect Google Calendar.</p>
            )}
            <Button
              variant="destructive"
              disabled={disconnectMutation.isPending}
              onClick={() => disconnectMutation.mutate()}
            >
              {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <BackLink />
      <Card>
        <CardHeader>
          <CardTitle>Connect Google Calendar</CardTitle>
          <CardDescription>
            Wize AI will schedule your study sessions here once an assignment is broken down.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {connectMutation.isError && (
            <p className="text-sm text-destructive">Could not start the Google connection.</p>
          )}
          <Button disabled={connectMutation.isPending} onClick={() => connectMutation.mutate()}>
            {connectMutation.isPending ? "Redirecting..." : "Connect with Google Calendar"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
