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

const ConnectCanvasSchema = z.object({
  canvasBaseUrl: z.string().min(1, "Required"),
  apiToken: z.string().min(1, "Required"),
});

type ConnectCanvasInput = z.infer<typeof ConnectCanvasSchema>;

export function ConnectCanvas() {
  const queryClient = useQueryClient();
  const status = useConnectionStatus("canvas");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConnectCanvasInput>({ resolver: zodResolver(ConnectCanvasSchema) });

  const connectMutation = useMutation({
    mutationFn: api.connectCanvas,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: connectionStatusKey("canvas") });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: api.disconnectCanvas,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: connectionStatusKey("canvas") });
    },
  });

  if (status.data?.connected) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <Card>
          <CardHeader>
            <CardTitle>Canvas</CardTitle>
            <CardDescription>Wize AI can read your assignments from Canvas.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-500">
              <Check className="size-4" />
              Canvas connected
            </p>
            {disconnectMutation.isError && (
              <p className="text-sm text-destructive">Could not disconnect Canvas.</p>
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
          <CardTitle>Connect Canvas</CardTitle>
          <CardDescription>
            Enter your Canvas URL and an API token so Wize AI can read your assignments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={handleSubmit((input) => connectMutation.mutate(input))}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="canvasBaseUrl">Canvas URL</Label>
              <Input
                id="canvasBaseUrl"
                placeholder="https://canvas.myschool.edu"
                {...register("canvasBaseUrl")}
              />
              {errors.canvasBaseUrl && (
                <p className="text-sm text-destructive">{errors.canvasBaseUrl.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="apiToken">API token</Label>
              <Input id="apiToken" type="password" {...register("apiToken")} />
              {errors.apiToken && (
                <p className="text-sm text-destructive">{errors.apiToken.message}</p>
              )}
            </div>
            {connectMutation.isError && (
              <p className="text-sm text-destructive">Could not connect to Canvas.</p>
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
