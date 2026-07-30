import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BackLink } from "@/components/BackLink";
import { api } from "@/lib/apiClient";
import { connectionStatusKey, useConnectionStatus } from "@/lib/connections";

const ConnectCalendarSchema = z.object({
  accessToken: z.string().min(1, "Required"),
});

type ConnectCalendarInput = z.infer<typeof ConnectCalendarSchema>;

export function ConnectCalendar() {
  const queryClient = useQueryClient();
  const status = useConnectionStatus("calendar");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConnectCalendarInput>({ resolver: zodResolver(ConnectCalendarSchema) });

  const connectMutation = useMutation({
    mutationFn: api.connectCalendar,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: connectionStatusKey("calendar") });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: api.disconnectCalendar,
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
            Google sign-in isn&apos;t wired up yet — paste a token to simulate a connection while
            the real OAuth flow is built.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={handleSubmit((input) => connectMutation.mutate(input))}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="accessToken">Access token</Label>
              <Input id="accessToken" type="password" {...register("accessToken")} />
              {errors.accessToken && (
                <p className="text-sm text-destructive">{errors.accessToken.message}</p>
              )}
            </div>
            {connectMutation.isError && (
              <p className="text-sm text-destructive">Could not connect to Google Calendar.</p>
            )}
            <Button type="submit" disabled={connectMutation.isPending}>
              {connectMutation.isPending ? "Connecting..." : "Connect"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
