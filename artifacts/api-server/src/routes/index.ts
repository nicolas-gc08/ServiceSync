import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import submissionsRouter from "./submissions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(submissionsRouter);

export default router;
