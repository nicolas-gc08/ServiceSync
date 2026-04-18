import OpenAI from "openai";
import { createRequire } from "module";
import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import os from "os";
import { randomBytes } from "crypto";
import pLimit from "p-limit";

const execFileAsync = promisify(execFile);
const _require = createRequire(import.meta.url);
const _pdfParseModule = _require("pdf-parse");
const pdfParse: (buffer: Buffer) => Promise<{ text: string }> =
  typeof _pdfParseModule === "function" ? _pdfParseModule : (_pdfParseModule.default ?? _pdfParseModule);

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const SCAN_TIMEOUT_MS = 120_000;
const scanLimit = pLimit(5);

export interface FieldResult {
  found: boolean;
  value: string | null;
}

export interface EntryResult {
  date: string | null;
  activity: string | null;
  timeIn: string | null;
  timeOut: string | null;
  hours: string | null;
  contactName: string | null;
  hasSignature: boolean;
}

export interface ScanResult {
  status: "passed" | "warnings" | "failed" | "error";
  message: string;
  isCorrectTemplate: boolean;
  isLegible: boolean;
  fields: {
    studentName: FieldResult;
    studentNumber: FieldResult;
    graduationYear: FieldResult;
    schoolName: FieldResult;
    schoolYear: FieldResult;
    gradeLevel: FieldResult;
    organization: FieldResult;
    totalHoursVolunteered: FieldResult;
  };
  entries: EntryResult[];
  warnings: string[];
  errors: string[];
}

const SYSTEM_PROMPT = `You are a document analysis assistant for a school volunteer hours program.
You analyze Broward County Public Schools "Student Volunteer Service Program - Volunteer Hour Log Sheet" forms.

IMPORTANT: Documents may be scanned, photographed, or digitally created. Accept all of the following as valid and legible:
- Documents rotated at ANY angle including 90, 180, or 270 degrees — phone photos are often taken sideways or upside down. Read rotated text by mentally rotating the image.
- Documents photographed from an angle or off to the side, causing perspective distortion or a trapezoidal shape — this is common when students photograph forms on a desk without holding the camera directly overhead.
- Documents with shadows, uneven lighting, or minor glare
- Handwritten entries on a printed template
- Scanned or photographed copies with mild blurriness
- Documents with fold lines or creases
Only mark isLegible as false if the document is so unclear that key fields genuinely cannot be read at all, regardless of orientation.

The template has these header fields:
- Student Name
- Student Number (student ID)
- Graduation Year
- School Name
- School Year (e.g. "2024-2025")
- Grade Level
- Name of Organization (the org where service is being performed)

And a log table with columns: Date, Activity or Task Performed, Time In, Time Out, Total Hours Worked, Contact Person's Signature (Print Name + Signature)

And a final field: Total Hours Volunteered

Your task is to analyze the document and return a JSON object (no markdown, no explanation, just valid JSON) with this exact structure:
{
  "isCorrectTemplate": boolean,
  "isLegible": boolean,
  "fields": {
    "studentName": { "found": boolean, "value": string|null },
    "studentNumber": { "found": boolean, "value": string|null },
    "graduationYear": { "found": boolean, "value": string|null },
    "schoolName": { "found": boolean, "value": string|null },
    "schoolYear": { "found": boolean, "value": string|null },
    "gradeLevel": { "found": boolean, "value": string|null },
    "organization": { "found": boolean, "value": string|null },
    "totalHoursVolunteered": { "found": boolean, "value": string|null }
  },
  "entries": [
    {
      "date": string|null,
      "activity": string|null,
      "timeIn": string|null,
      "timeOut": string|null,
      "hours": string|null,
      "contactName": string|null,
      "hasSignature": boolean
    }
  ],
  "warnings": string[],
  "errors": string[]
}

Rules:
- isCorrectTemplate: true if this appears to be the Broward County volunteer log sheet. Look for key phrases like "Student Volunteer Service Program", "Volunteer Hour Log Sheet", "BROWARD", or the specific column headers — even if the image is rotated 90/180/270 degrees. Read the text at whatever orientation it appears. A scanned/photographed copy taken sideways or upside-down still counts as correct if the text matches.
- isLegible: true if the key fields can be reasonably read, even if the document is slightly skewed, has shadows, or is a scan. Only set false if the document is truly unreadable.
- For each field, set "found" to true only if there is an actual value (not just a blank line or underscores). Extract the actual value if present. Use best-effort reading for handwritten or scanned values.
- entries: include only rows that have at least a date or activity filled in (skip completely blank rows).
- hasSignature: set to true if a contact person's name or signature appears present for that entry.
- When reading handwritten numbers, be especially careful: the number "11" written by hand can look like two close "1"s, or like "ii" in garbled text. Always cross-check the "Total Hours Worked" value with the Time In and Time Out times (e.g. 1:00 to 12:00 = 11 hours, not 1 hour). Use arithmetic to verify: if Time In and Time Out suggest more hours than the written value, trust the time calculation.
- warnings: list user-friendly messages for missing optional/expected fields only. E.g. "School year not filled in", "Contact signature missing on entry 1". Do NOT warn about scan quality, angles, or shadows.
- errors: list only critical problems that would prevent processing. E.g. "This does not appear to be the correct volunteer log template", "No service entries found". Do NOT add errors for minor scan imperfections.
- If isCorrectTemplate is false, set errors to ["This does not appear to be the Broward County volunteer log template. Please upload the correct form."] and skip other analysis.
- If isLegible is false, set errors to ["The document could not be read. Please upload a clearer image or PDF."] and skip other analysis.`;

const EMPTY_FIELDS: ScanResult["fields"] = {
  studentName: { found: false, value: null },
  studentNumber: { found: false, value: null },
  graduationYear: { found: false, value: null },
  schoolName: { found: false, value: null },
  schoolYear: { found: false, value: null },
  gradeLevel: { found: false, value: null },
  organization: { found: false, value: null },
  totalHoursVolunteered: { found: false, value: null },
};

async function extractPdfText(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

function isTextUsable(text: string): boolean {
  if (!text || text.trim().length < 50) return false;
  // Count characters that look like OCR garbage: non-ASCII, curly braces, pipes, slashes mixed in words
  const total = text.length;
  const junk = (text.match(/[^\x00-\x7E]|[{}|\\~`^<>]/g) ?? []).length;
  const junkRatio = junk / total;
  // If more than 5% junk characters, the text is too garbled to trust
  return junkRatio < 0.05;
}

async function convertScannedPdfToImage(pdfPath: string): Promise<string | null> {
  const tmpDir = os.tmpdir();
  const prefix = path.join(tmpDir, `scan_${randomBytes(12).toString("hex")}`);
  try {
    await execFileAsync("pdftoppm", [
      "-jpeg",
      "-f", "1",
      "-l", "1",
      "-r", "200",
      pdfPath,
      prefix,
    ]);
    const candidate = `${prefix}-1.jpg`;
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      const files = await fs.readdir(tmpDir);
      const match = files.find((f) => f.startsWith(path.basename(prefix)) && (f.endsWith(".jpg") || f.endsWith(".jpeg")));
      return match ? path.join(tmpDir, match) : null;
    }
  } catch {
    return null;
  }
}

async function analyzeWithLLM(content: string, isImage: boolean, mimeType = "image/jpeg"): Promise<ScanResult> {
  let messages: OpenAI.Chat.ChatCompletionMessageParam[];

  if (isImage) {
    const base64 = content;
    messages = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Analyze this volunteer hour log form image. It may be a scan or photo — please read all fields as best you can and return the JSON analysis.",
          },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64}` },
          },
        ],
      },
    ];
  } else {
    messages = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Analyze this extracted PDF text from a volunteer hour log form:\n\n${content}`,
      },
    ];
  }

  const response = await scanLimit(() =>
    openai.chat.completions.create(
      { model: "gpt-5-mini", max_completion_tokens: 8192, messages },
      { signal: AbortSignal.timeout(SCAN_TIMEOUT_MS) },
    )
  );

  const raw = response.choices[0]?.message?.content ?? "";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(cleaned);

  const { isCorrectTemplate, isLegible, fields, entries, warnings, errors } = parsed;

  let status: ScanResult["status"];
  if (!isCorrectTemplate || !isLegible || errors.length > 0) {
    status = "failed";
  } else if (warnings.length > 0) {
    status = "warnings";
  } else {
    status = "passed";
  }

  const message =
    status === "failed"
      ? errors[0] ?? "The document has critical issues that must be resolved."
      : status === "warnings"
        ? `Form scanned with ${warnings.length} warning${warnings.length !== 1 ? "s" : ""}.`
        : "All required fields detected successfully.";

  return {
    status,
    message,
    isCorrectTemplate: Boolean(isCorrectTemplate),
    isLegible: Boolean(isLegible),
    fields: fields ?? EMPTY_FIELDS,
    entries: Array.isArray(entries) ? entries : [],
    warnings: Array.isArray(warnings) ? warnings : [],
    errors: Array.isArray(errors) ? errors : [],
  } as ScanResult;
}

export async function scanFile(filePath: string): Promise<ScanResult> {
  const ext = path.extname(filePath).toLowerCase();
  const isImage = [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext);

  try {
    if (isImage) {
      const mimeMap: Record<string, string> = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp",
      };
      const mimeType = mimeMap[ext] ?? "image/jpeg";
      const buffer = await fs.readFile(filePath);
      const base64 = buffer.toString("base64");
      return await analyzeWithLLM(base64, true, mimeType);
    } else {
      // For PDFs: always try image conversion first — the vision model reads
      // handwriting and scanned forms far more accurately than text extraction,
      // which can silently garble values (e.g. "11" → "ii").
      const imagePath = await convertScannedPdfToImage(filePath);
      if (imagePath) {
        try {
          const buffer = await fs.readFile(imagePath);
          const base64 = buffer.toString("base64");
          return await analyzeWithLLM(base64, true, "image/jpeg");
        } finally {
          fs.unlink(imagePath).catch(() => {});
        }
      }

      // pdftoppm unavailable — fall back to text extraction for digital PDFs.
      let text = "";
      try {
        text = await extractPdfText(filePath);
      } catch {
        // pdf-parse also failed
      }

      if (isTextUsable(text)) {
        return await analyzeWithLLM(text, false);
      }

      return {
        status: "error",
        message: "The document scan could not process this PDF. Your submission will be accepted and reviewed manually.",
        isCorrectTemplate: false,
        isLegible: false,
        fields: EMPTY_FIELDS,
        entries: [],
        warnings: [],
        errors: [],
      };
    }
  } catch (err) {
    console.error("Scan error:", err);
    return {
      status: "error",
      message: "An error occurred while scanning the document.",
      isCorrectTemplate: false,
      isLegible: false,
      fields: EMPTY_FIELDS,
      entries: [],
      warnings: [],
      errors: ["An error occurred while scanning the document."],
    };
  }
}
