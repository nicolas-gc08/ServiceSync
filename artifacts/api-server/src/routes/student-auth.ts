import { Router } from "express";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import { db, studentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many attempts. Please wait 15 minutes." },
});

// POST /api/student/register
router.post("/register", limiter, async (req, res): Promise<void> => {
  const { studentId, email, password, firstName, lastName, graduationYear } = req.body;

  if (!studentId || !email || !password || !firstName || !lastName || !graduationYear) {
    res.status(400).json({ error: "All fields are required." });
    return;
  }

  const existing = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.studentId, studentId))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "An account with this Student ID already exists." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.insert(studentsTable).values({
    studentId,
    email,
    passwordHash,
    firstName,
    lastName,
    graduationYear,
  });

  res.status(201).json({ success: true });
});

// POST /api/student/login
router.post("/login", limiter, async (req, res): Promise<void> => {
  const { studentId, password } = req.body;

  if (!studentId || !password) {
    res.status(400).json({ error: "Student ID and password are required." });
    return;
  }

  const [student] = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.studentId, studentId))
    .limit(1);

  if (!student || !(await bcrypt.compare(password, student.passwordHash))) {
    res.status(401).json({ error: "Invalid Student ID or password." });
    return;
  }

  (req as any).signedCookies; // ensure cookies parsed
  res.cookie("student_session", student.studentId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
    signed: true,
  });

  res.json({ success: true, studentId: student.studentId, firstName: student.firstName });
});

// POST /api/student/logout
router.post("/logout", (_req, res): void => {
  res.clearCookie("student_session");
  res.json({ message: "Logged out." });
});

// GET /api/student/me
router.get("/me", (req, res): void => {
  const studentId = (req as any).signedCookies?.student_session;
  res.json({ authenticated: !!studentId, studentId: studentId ?? null });
});

export default router;
