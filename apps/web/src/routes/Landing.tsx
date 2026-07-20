import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export function Landing() {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <h1 className="font-heading text-3xl font-medium text-foreground">
        Never miss another assignment deadline.
      </h1>
      <p className="text-muted-foreground">
        Wize AI reads your Canvas assignments, breaks them into study sessions, schedules them on
        your Google Calendar, and keeps you on track over WhatsApp.
      </p>
      <div className="flex gap-3">
        <Button size="lg" nativeButton={false} render={<Link to="/signup">Get started</Link>} />
        <Button
          size="lg"
          variant="outline"
          nativeButton={false}
          render={<Link to="/login">Log in</Link>}
        />
      </div>
    </div>
  );
}
