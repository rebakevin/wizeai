import { app } from "./app";
import { env } from "./config/env";
import { ensureDemoUser } from "./lib/demoUser";

await ensureDemoUser();

app.listen(env.PORT, () => {
  console.log(`wizeai api listening on http://localhost:${env.PORT}`);
});
