import type { Request, Response, NextFunction } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const session = (req as any).signedCookies?.admin_session;
  if (session === "authenticated") {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
}
