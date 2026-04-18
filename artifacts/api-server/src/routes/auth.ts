import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";

const router: IRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please wait 15 minutes before trying again." },
});

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";

if (!process.env.ADMIN_PASSWORD) {
  throw new Error("ADMIN_PASSWORD environment secret is required but not set.");
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

router.post("/auth/login", loginLimiter, async (req, res): Promise<void> => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  res.cookie("admin_session", "authenticated", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000,
    signed: true,
  });

  res.json({ success: true, username });
});

router.post("/auth/logout", async (_req, res): Promise<void> => {
  res.clearCookie("admin_session");
  res.json({ message: "Logged out successfully" });
});

router.get("/auth/me", (req, res): void => {
  const session = (req as any).signedCookies?.admin_session;
  if (session === "authenticated") {
    res.json({ authenticated: true, username: ADMIN_USERNAME });
  } else {
    res.json({ authenticated: false, username: null });
  }
});

export default router;
