import OpenAI from "openai";
import { createRequire } from "module";
import fs from "fs/promises";
import path from "path";

const _require = createRequire(import.meta.url);
const pdfParse: (buffer: Buffer) => Promise<{ text: string }> = _require("pdf-parse");

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

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

Your task is to analyze the extracted text and return a JSON object (no markdown, no explanation, just valid JSON) with this exact structure:
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
- isCorrectTemplate: true if this appears to be the Broward County volunteer log sheet. Look for key phrases like "Student Volunteer Service Program", "Volunteer Hour Log Sheet", "BROWARD" or the specific column headers.
- isLegible: true if the text content is readable and makes sense. false if the content is garbled, mostly empty, or unreadable.
- For each field, set "found" to true only if there is an actual value (not just a blank line or underscores). Extract the actual value if present.
- entries: include only rows that have at least a date or activity filled in (skip completely blank rows).
- hasSignature: set to true if a contact person's signature appears present for that entry (e.g., a name is printed, or signature text is present).
- warnings: list user-friendly messages for missing optional/expected fields. E.g. "School year not filled in", "Contact signature missing on entry 1".
- errors: list critical problems. E.g. "This does not appear to be the correct volunteer log template", "Document is illegible or unreadable", "No service entries found".
- If isCorrectTemplate is false, set errors to ["This does not appear to be the Broward County volunteer log template. Please upload the correct form."] and skip other analysis.
- If isLegible is false, set errors to ["The document could not be read. Please upload a clearer scan or PDF."] and skip other analysis.`;

async function extractPdfText(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

async function analyzeWithLLM(content: string, isImage: boolean): Promise<ScanResult> {
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
            text: "Analyze this volunteer hour log form image and return the JSON analysis.",
          },
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${base64}` },
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

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 8192,
    messages,
  });

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

  const criticalFields = ["studentName", "studentNumber", "graduationYear", "organization"] as const;
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
    fields: fields ?? {
      studentName: { found: false, value: null },
      studentNumber: { found: false, value: null },
      graduationYear: { found: false, value: null },
      schoolName: { found: false, value: null },
      schoolYear: { found: false, value: null },
      gradeLevel: { found: false, value: null },
      organization: { found: false, value: null },
      totalHoursVolunteered: { found: false, value: null },
    },
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
      const buffer = await fs.readFile(filePath);
      const base64 = buffer.toString("base64");
      return await analyzeWithLLM(base64, true);
    } else {
      const text = await extractPdfText(filePath);
      if (!text || text.trim().length < 20) {
        return {
          status: "failed",
          message: "The document could not be read. Please upload a clearer scan or text-based PDF.",
          isCorrectTemplate: false,
          isLegible: false,
          fields: {
            studentName: { found: false, value: null },
            studentNumber: { found: false, value: null },
            graduationYear: { found: false, value: null },
            schoolName: { found: false, value: null },
            schoolYear: { found: false, value: null },
            gradeLevel: { found: false, value: null },
            organization: { found: false, value: null },
            totalHoursVolunteered: { found: false, value: null },
          },
          entries: [],
          warnings: [],
          errors: ["The document could not be read. Please upload a clearer scan or text-based PDF."],
        };
      }
      return await analyzeWithLLM(text, false);
    }
  } catch (err) {
    console.error("Scan error:", err);
    return {
      status: "error",
      message: "An error occurred while scanning the document.",
      isCorrectTemplate: false,
      isLegible: false,
      fields: {
        studentName: { found: false, value: null },
        studentNumber: { found: false, value: null },
        graduationYear: { found: false, value: null },
        schoolName: { found: false, value: null },
        schoolYear: { found: false, value: null },
        gradeLevel: { found: false, value: null },
        organization: { found: false, value: null },
        totalHoursVolunteered: { found: false, value: null },
      },
      entries: [],
      warnings: [],
      errors: ["An error occurred while scanning the document."],
    };
  }
}
