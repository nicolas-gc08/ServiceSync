import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const submissionsTable = pgTable("submissions", {
  id: serial("id").primaryKey(),
  submissionId: text("submission_id").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  studentId: text("student_id").notNull(),
  graduationYear: integer("graduation_year").notNull(),
  email: text("email"),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name").notNull(),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  extractedOrg: text("extracted_org"),
  extractedHours: text("extracted_hours"),
  scanStatus: text("scan_status"),
  scanData: text("scan_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSubmissionSchema = createInsertSchema(submissionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;
export type Submission = typeof submissionsTable.$inferSelect;
