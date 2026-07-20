import { Router } from "express";
import { canvasRouter } from "../canvas/routes";
import { calendarRouter } from "../calendar/routes";
import { whatsappRouter } from "../whatsapp/routes";
import { plannerRouter } from "../planner/routes";
import { schedulerRouter } from "../scheduler/routes";
import { assistantRouter } from "../assistant/routes";
import { meRouter } from "../auth/routes";

export const apiRouter = Router();

apiRouter.use(meRouter);
apiRouter.use("/canvas", canvasRouter);
apiRouter.use("/calendar", calendarRouter);
apiRouter.use("/whatsapp", whatsappRouter);
apiRouter.use("/planner", plannerRouter);
apiRouter.use("/schedule", schedulerRouter);
apiRouter.use("/agent", assistantRouter);
