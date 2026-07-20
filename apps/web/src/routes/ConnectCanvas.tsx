import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { api } from "@/lib/apiClient";

const ConnectCanvasSchema = z.object({
  canvasBaseUrl: z.string().min(1, "Required"),
  apiToken: z.string().min(1, "Required"),
});

type ConnectCanvasInput = z.infer<typeof ConnectCanvasSchema>;

export function ConnectCanvas() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConnectCanvasInput>({ resolver: zodResolver(ConnectCanvasSchema) });

  const mutation = useMutation({ mutationFn: api.connectCanvas });

  return (
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
          onSubmit={handleSubmit((input) => mutation.mutate(input))}
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
          {mutation.isError && (
            <p className="text-sm text-destructive">Could not connect to Canvas.</p>
          )}
          {mutation.isSuccess && (
            <p className="text-sm text-muted-foreground">Canvas connected.</p>
          )}
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Connecting..." : "Connect"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
