import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import { db, submissionsTable } from "@workspace/db";
import { eq, ilike, or, desc } from "drizzle-orm";
import {
  CreateSubmissionBody,
  UpdateSubmissionBody,
  UpdateSubmissionParams,
  GetSubmissionParams,
  ListSubmissionsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueId = randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueId}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and image files are allowed"));
    }
  },
});

function generateSubmissionId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `VH-${year}${month}${day}-${rand}`;
}

router.post("/submissions/upload", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const fileUrl = `/api/submissions/file/${req.file.filename}`;
  res.json({ fileUrl, fileName: req.file.originalname });
});

router.get("/submissions/file/:filename", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
  const filePath = path.join(UPLOADS_DIR, raw);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).json({ error: "File not found" });
    }
  });
});

router.get("/submissions/stats", async (_req, res): Promise<void> => {
  const all = await db.select().from(submissionsTable);
  const stats = {
    total: all.length,
    pending: all.filter((s) => s.status === "pending").length,
    approved: all.filter((s) => s.status === "approved").length,
    rejected: all.filter((s) => s.status === "rejected").length,
  };
  res.json(stats);
});

router.get("/submissions/upload-token", async (_req, res): Promise<void> => {
  res.json({ fileUrl: "", fileName: "" });
});

router.get("/submissions", async (req, res): Promise<void> => {
  const queryResult = ListSubmissionsQueryParams.safeParse(req.query);
  const search = queryResult.success ? queryResult.data.search : undefined;
  const status = queryResult.success ? queryResult.data.status : undefined;

  let query = db.select().from(submissionsTable).$dynamic();

  const conditions = [];

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(or(ilike(submissionsTable.lastName, term), ilike(submissionsTable.studentId, term)));
  }

  if (status && status !== "all") {
    conditions.push(eq(submissionsTable.status, status));
  }

  const results =
    conditions.length > 0
      ? await db
          .select()
          .from(submissionsTable)
          .where(conditions.length === 1 ? conditions[0] : conditions.reduce((a, b) => (a && b) as any))
          .orderBy(submissionsTable.lastName)
      : await db.select().from(submissionsTable).orderBy(submissionsTable.lastName);

  res.json(results);
});

router.post("/submissions", async (req, res): Promise<void> => {
  const parsed = CreateSubmissionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const submissionId = generateSubmissionId();

  const [submission] = await db
    .insert(submissionsTable)
    .values({
      submissionId,
      firstName: data.firstName,
      lastName: data.lastName,
      studentId: String(data.studentId),
      graduationYear: Number(data.graduationYear),
      email: data.email ?? null,
      fileUrl: data.fileUrl,
      fileName: data.fileName,
      status: "pending",
    })
    .returning();

  res.status(201).json(submission);
});

router.get("/submissions/:id", async (req, res): Promise<void> => {
  const paramsResult = GetSubmissionParams.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: "Invalid submission ID" });
    return;
  }

  const [submission] = await db
    .select()
    .from(submissionsTable)
    .where(eq(submissionsTable.id, paramsResult.data.id));

  if (!submission) {
    res.status(404).json({ error: "Submission not found" });
    return;
  }

  res.json(submission);
});

router.patch("/submissions/:id", async (req, res): Promise<void> => {
  const paramsResult = UpdateSubmissionParams.safeParse(req.params);
  if (!paramsResult.success) {
    res.status(400).json({ error: "Invalid submission ID" });
    return;
  }

  const bodyResult = UpdateSubmissionBody.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: bodyResult.error.message });
    return;
  }

  const updateData: Partial<typeof submissionsTable.$inferInsert> = {};
  if (bodyResult.data.status !== undefined) {
    updateData.status = bodyResult.data.status;
  }
  if ("notes" in bodyResult.data) {
    updateData.notes = bodyResult.data.notes ?? null;
  }

  const [updated] = await db
    .update(submissionsTable)
    .set(updateData)
    .where(eq(submissionsTable.id, paramsResult.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Submission not found" });
    return;
  }

  res.json(updated);
});

export default router;
