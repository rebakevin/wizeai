import { Router } from "express";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { auth } from "./auth";

// Mounted before express.json() in app.ts — Better Auth needs the raw request body.
export const authHandler = toNodeHandler(auth);

export const meRouter = Router();

meRouter.get("/me", async (req, res) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.json(session);
});
