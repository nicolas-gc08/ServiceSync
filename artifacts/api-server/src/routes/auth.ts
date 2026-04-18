import { Router, type IRouter } from "express";
import cookieParser from "cookie-parser";

const router: IRouter = Router();

router.use(cookieParser());

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "volunteer2024";

router.post("/auth/login", async (req, res): Promise<void> => {
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
  });

  res.json({ success: true, username });
});

router.post("/auth/logout", async (_req, res): Promise<void> => {
  res.clearCookie("admin_session");
  res.json({ message: "Logged out successfully" });
});

router.get("/auth/me", (req, res): void => {
  const session = (req as any).cookies?.admin_session;
  if (session === "authenticated") {
    res.json({ authenticated: true, username: ADMIN_USERNAME });
  } else {
    res.json({ authenticated: false, username: null });
  }
});

export default router;
