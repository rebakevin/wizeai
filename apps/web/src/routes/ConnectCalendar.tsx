import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { api } from "@/lib/apiClient";

const ConnectCalendarSchema = z.object({
  accessToken: z.string().min(1, "Required"),
});

type ConnectCalendarInput = z.infer<typeof ConnectCalendarSchema>;

export function ConnectCalendar() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConnectCalendarInput>({ resolver: zodResolver(ConnectCalendarSchema) });

  const mutation = useMutation({ mutationFn: api.connectCalendar });

  return (
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
          onSubmit={handleSubmit((input) => mutation.mutate(input))}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accessToken">Access token</Label>
            <Input id="accessToken" type="password" {...register("accessToken")} />
            {errors.accessToken && (
              <p className="text-sm text-destructive">{errors.accessToken.message}</p>
            )}
          </div>
          {mutation.isError && (
            <p className="text-sm text-destructive">Could not connect to Google Calendar.</p>
          )}
          {mutation.isSuccess && (
            <p className="text-sm text-muted-foreground">Calendar connected.</p>
          )}
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Connecting..." : "Connect"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
