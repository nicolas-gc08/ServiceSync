import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import { mkdirSync } from "fs";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
mkdirSync(UPLOADS_DIR, { recursive: true });

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down and try again shortly." },
});

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser(SESSION_SECRET));
app.use(globalLimiter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
