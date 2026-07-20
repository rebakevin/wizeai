import { Route, Routes } from "react-router";
import { Layout } from "@/components/Layout";
import { RequireAuth } from "@/components/RequireAuth";
import { Landing } from "@/routes/Landing";
import { Signup } from "@/routes/Signup";
import { Login } from "@/routes/Login";
import { Account } from "@/routes/Account";
import { ConnectCanvas } from "@/routes/ConnectCanvas";
import { ConnectCalendar } from "@/routes/ConnectCalendar";
import { ConnectWhatsapp } from "@/routes/ConnectWhatsapp";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="signup" element={<Signup />} />
        <Route path="login" element={<Login />} />
        <Route element={<RequireAuth />}>
          <Route path="account" element={<Account />} />
          <Route path="connect/canvas" element={<ConnectCanvas />} />
          <Route path="connect/calendar" element={<ConnectCalendar />} />
          <Route path="connect/whatsapp" element={<ConnectWhatsapp />} />
        </Route>
      </Route>
    </Routes>
  );
}
