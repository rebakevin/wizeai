import { Link, Outlet } from "react-router";
import { Button } from "@/components/ui/button";
import { signOut, useSession } from "@/lib/authClient";

export function Layout() {
  const { data: session } = useSession();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <Link to="/" className="font-heading text-lg font-medium">
          Wize AI
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {session ? (
            <>
              <Link to="/account" className="text-muted-foreground hover:text-foreground">
                Account
              </Link>
              <Button size="sm" variant="outline" onClick={() => signOut()}>
                Log out
              </Button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-muted-foreground hover:text-foreground">
                Log in
              </Link>
              <Button size="sm" nativeButton={false} render={<Link to="/signup">Sign up</Link>} />
            </>
          )}
        </nav>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <Outlet />
      </main>
    </div>
  );
}
