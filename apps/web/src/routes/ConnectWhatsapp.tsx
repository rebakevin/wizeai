import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { api } from "@/lib/apiClient";

const ConnectWhatsappSchema = z.object({
  phoneNumber: z.string().min(1, "Required"),
});

type ConnectWhatsappInput = z.infer<typeof ConnectWhatsappSchema>;

export function ConnectWhatsapp() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConnectWhatsappInput>({ resolver: zodResolver(ConnectWhatsappSchema) });

  const mutation = useMutation({ mutationFn: api.connectWhatsapp });

  return (
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
          onSubmit={handleSubmit((input) => mutation.mutate(input))}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phoneNumber">Phone number</Label>
            <Input id="phoneNumber" placeholder="+15551234567" {...register("phoneNumber")} />
            {errors.phoneNumber && (
              <p className="text-sm text-destructive">{errors.phoneNumber.message}</p>
            )}
          </div>
          {mutation.isError && (
            <p className="text-sm text-destructive">Could not connect WhatsApp.</p>
          )}
          {mutation.isSuccess && (
            <p className="text-sm text-muted-foreground">WhatsApp connected.</p>
          )}
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Connecting..." : "Connect"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
