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

const ConnectWhatsappSchema = z.object({
  phoneNumber: z.string().min(1, "Required"),
});

type ConnectWhatsappInput = z.infer<typeof ConnectWhatsappSchema>;

export function ConnectWhatsapp() {
  const queryClient = useQueryClient();
  const status = useConnectionStatus("whatsapp");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConnectWhatsappInput>({ resolver: zodResolver(ConnectWhatsappSchema) });

  const connectMutation = useMutation({
    mutationFn: api.connectWhatsapp,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: connectionStatusKey("whatsapp") });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: api.disconnectWhatsapp,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: connectionStatusKey("whatsapp") });
    },
  });

  if (status.data?.connected) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <Card>
          <CardHeader>
            <CardTitle>WhatsApp</CardTitle>
            <CardDescription>
              Wize AI will message you here with reminders and study session check-ins.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-500">
              <Check className="size-4" />
              WhatsApp connected
            </p>
            {disconnectMutation.isError && (
              <p className="text-sm text-destructive">Could not disconnect WhatsApp.</p>
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
          <CardTitle>Connect WhatsApp</CardTitle>
          <CardDescription>
            Wize AI will message you here with reminders and study session check-ins.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={handleSubmit((input) => connectMutation.mutate(input))}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phoneNumber">Phone number</Label>
              <Input id="phoneNumber" placeholder="+15551234567" {...register("phoneNumber")} />
              {errors.phoneNumber && (
                <p className="text-sm text-destructive">{errors.phoneNumber.message}</p>
              )}
            </div>
            {connectMutation.isError && (
              <p className="text-sm text-destructive">Could not connect WhatsApp.</p>
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
