import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router";
import { getSession } from "@/lib/authClient";

export function RequireAuth() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    getSession().then(({ data }) => {
      if (active) setAuthenticated(!!data);
    });
    return () => {
      active = false;
    };
  }, []);

  if (authenticated === null) {
    return null;
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
