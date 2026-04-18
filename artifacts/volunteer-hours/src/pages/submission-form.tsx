import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import {
  CheckCircle2,
  Upload,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Check,
  X,
  ScanLine,
  FileText,
} from "lucide-react";
import { useCreateSubmission } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ACCEPTED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

const formSchema = z.object({
  firstName: z.string().min(2, "First name is required"),
  lastName: z.string().min(2, "Last name is required"),
  studentId: z.string().min(4, "Student ID is required"),
  graduationYear: z.coerce.number().min(2024).max(2030),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
});

interface FieldResult {
  found: boolean;
  value: string | null;
}

interface ScanResult {
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
  entries: Array<{
    date: string | null;
    activity: string | null;
    timeIn: string | null;
    timeOut: string | null;
    hours: string | null;
    contactName: string | null;
    hasSignature: boolean;
  }>;
  warnings: string[];
  errors: string[];
}

interface UploadedFile {
  fileUrl: string;
  fileName: string;
  scanStatus: string;
  scanData: ScanResult;
}

const FIELD_LABELS: Record<keyof ScanResult["fields"], string> = {
  studentName: "Student Name",
  studentNumber: "Student Number",
  graduationYear: "Graduation Year",
  schoolName: "School Name",
  schoolYear: "School Year",
  gradeLevel: "Grade Level",
  organization: "Organization Name",
  totalHoursVolunteered: "Total Hours Volunteered",
};

const BLOCKING_FIELDS: Array<[keyof ScanResult["fields"], string]> = [
  ["studentName", "Student name"],
  ["studentNumber", "Student number"],
  ["graduationYear", "Graduation year"],
  ["schoolName", "School name"],
  ["schoolYear", "School year"],
  ["gradeLevel", "Grade level"],
  ["organization", "Organization name"],
  ["totalHoursVolunteered", "Total hours volunteered"],
];

function computeBlockingErrors(scan: ScanResult): string[] {
  if (!scan.isCorrectTemplate) {
    return ["This does not appear to be the correct volunteer log template. Please upload the Broward County Volunteer Hour Log Sheet."];
  }
  if (!scan.isLegible) {
    return ["The document is not legible. Please upload a clearer scan or PDF."];
  }

  const errors: string[] = [];

  for (const [field, label] of BLOCKING_FIELDS) {
    if (!scan.fields[field]?.found) {
      errors.push(`${label} is missing or not legible`);
    }
  }

  const missingDateCount = scan.entries.filter((e) => !e.date).length;
  if (missingDateCount > 0) {
    errors.push(
      `Date is missing for ${missingDateCount} log entr${missingDateCount === 1 ? "y" : "ies"}`
    );
  }

  return errors;
}

function computeTimingWarnings(scan: ScanResult): string[] {
  if (!scan.isCorrectTemplate || !scan.isLegible) return [];
  const warnings: string[] = [];
  scan.entries.forEach((entry, i) => {
    const missing: string[] = [];
    if (!entry.timeIn) missing.push("Time In");
    if (!entry.timeOut) missing.push("Time Out");
    if (missing.length > 0) {
      warnings.push(
        `Entry ${i + 1}: ${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} missing`
      );
    }
  });
  return warnings;
}

function ScanResultPanel({ scan }: { scan: ScanResult }) {
  const blockingErrors = computeBlockingErrors(scan);
  const timingWarnings = computeTimingWarnings(scan);
  const hasBlockingErrors = blockingErrors.length > 0;
  const hasTimingWarnings = timingWarnings.length > 0;

  const overallStatus = hasBlockingErrors ? "failed" : hasTimingWarnings ? "warnings" : "passed";

  const panelClass =
    overallStatus === "failed"
      ? "border-red-200 bg-red-50"
      : overallStatus === "warnings"
        ? "border-amber-200 bg-amber-50"
        : "border-green-200 bg-green-50";

  const iconClass =
    overallStatus === "failed"
      ? "text-red-600"
      : overallStatus === "warnings"
        ? "text-amber-600"
        : "text-green-600";

  const Icon =
    overallStatus === "failed" ? AlertCircle : overallStatus === "warnings" ? AlertTriangle : CheckCircle2;

  const headingText =
    overallStatus === "failed"
      ? "Document cannot be submitted"
      : overallStatus === "warnings"
        ? "Document has warnings"
        : "Document scan passed";

  return (
    <div className={`rounded-lg border p-4 space-y-4 ${panelClass}`}>
      <div className={`flex items-start gap-3 ${iconClass}`}>
        <Icon className="h-5 w-5 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-sm">{headingText}</p>
          {!hasBlockingErrors && !hasTimingWarnings && (
            <p className="text-sm text-muted-foreground mt-0.5">All required fields detected.</p>
          )}
        </div>
      </div>

      {blockingErrors.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Must fix before submitting</p>
          <ul className="space-y-1">
            {blockingErrors.map((e, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-red-700">
                <X className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      {timingWarnings.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Warnings (submission allowed)</p>
          <ul className="space-y-1">
            {timingWarnings.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {scan.isCorrectTemplate && scan.isLegible && (
        <div className="space-y-1.5 pt-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Field Detection</p>
          <div className="grid grid-cols-2 gap-1">
            {(Object.entries(scan.fields) as [keyof typeof scan.fields, FieldResult][]).map(([key, field]) => (
              <div key={key} className="flex items-center gap-1.5 text-xs">
                {field.found ? (
                  <Check className="h-3 w-3 text-green-600 shrink-0" />
                ) : (
                  <X className="h-3 w-3 text-red-500 shrink-0" />
                )}
                <span className={field.found ? "text-foreground" : "text-muted-foreground"}>
                  {FIELD_LABELS[key]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {scan.isCorrectTemplate && scan.isLegible && scan.entries.length > 0 && (
        <div className="space-y-1 pt-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Log Entries Detected ({scan.entries.length})
          </p>
          <div className="space-y-1">
            {scan.entries.map((entry, i) => (
              <div key={i} className="flex items-center justify-between text-xs bg-white/60 rounded px-2 py-1">
                <span className={entry.date ? "text-muted-foreground" : "text-red-500 font-medium"}>
                  {entry.date ?? "No date"}
                </span>
                <span className="max-w-[120px] truncate">{entry.activity ?? "No activity"}</span>
                <span className="font-medium">{entry.hours ?? "—"} hrs</span>
                <span className={entry.hasSignature ? "text-green-600" : "text-red-500"}>
                  {entry.hasSignature ? "Signed" : "No sig"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SubmissionForm() {
  useEffect(() => {
    document.title = "ServiceSync";
  }, []);

  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{ id: string; timestamp: Date } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createSubmission = useCreateSubmission();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      studentId: "",
      graduationYear: new Date().getFullYear(),
      email: "",
    },
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
      toast({
        title: "Unsupported file type",
        description: "Please upload a PDF, JPG, PNG, or WebP file.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "File too large",
        description: "Maximum file size is 20MB.",
        variant: "destructive",
      });
      return;
    }

    setSelectedFileName(file.name);
    setUploadedFile(null);
    setIsScanning(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/submissions/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");

      const data = await res.json();

      setUploadedFile({
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        scanStatus: data.scanStatus,
        scanData: typeof data.scanData === "string" ? JSON.parse(data.scanData) : data.scanData,
      });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: "There was an error uploading your file. Please try again.",
        variant: "destructive",
      });
      setSelectedFileName(null);
    } finally {
      setIsScanning(false);
    }
  }

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!uploadedFile) {
      toast({ title: "No file uploaded", description: "Please select a file first.", variant: "destructive" });
      return;
    }

    const blockingErrors = computeBlockingErrors(uploadedFile.scanData);
    if (blockingErrors.length > 0) {
      toast({
        title: "Document issues",
        description: "Please fix the document issues before submitting.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const submission = await createSubmission.mutateAsync({
        data: {
          firstName: values.firstName,
          lastName: values.lastName,
          studentId: values.studentId,
          graduationYear: values.graduationYear,
          email: values.email || null,
          fileUrl: uploadedFile.fileUrl,
          fileName: uploadedFile.fileName,
          scanStatus: uploadedFile.scanStatus,
          scanData: typeof uploadedFile.scanData === "object"
            ? JSON.stringify(uploadedFile.scanData)
            : uploadedFile.scanData,
        },
      });

      setSuccessData({ id: submission.submissionId, timestamp: new Date() });
    } catch (error) {
      toast({
        title: "Submission failed",
        description: "There was an error submitting your hours. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (successData) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50/50 p-4">
        <Card className="w-full max-w-md shadow-lg border-primary/20">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Submission Successful</CardTitle>
            <CardDescription>Your volunteer hours have been received.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm border">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Submission ID</span>
                <span className="font-mono font-medium">{successData.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">{format(successData.timestamp, "MMM d, yyyy h:mm a")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium text-amber-600">Pending Review</span>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full"
              onClick={() => {
                form.reset();
                setSuccessData(null);
                setUploadedFile(null);
                setSelectedFileName(null);
              }}
            >
              Submit Another
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const blockingErrors = uploadedFile?.scanData ? computeBlockingErrors(uploadedFile.scanData) : [];
  const scanFailed = blockingErrors.length > 0;
  const isPending = isSubmitting;

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50/50 p-4 py-12">
      <Card className="w-full max-w-xl shadow-lg">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="ServiceSync" className="h-7 w-7 object-contain" />
            <CardTitle className="text-2xl font-bold tracking-tight text-primary">Service Hour Portal</CardTitle>
          </div>
          <CardDescription>Submit your community service hours for faculty review.</CardDescription>
        </CardHeader>

        <div className="mx-6 mb-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide mb-2">How to Submit</p>
          <ul className="space-y-1.5">
            {[
              "Take a clear picture of your service hour log or scan it as a PDF",
              "Make sure all sections are filled out (dates, hours, signature, organization info)",
              "Enter your details below",
              "Upload your completed log as a file or photo",
              "Click Submit Hours and wait for confirmation",
              "If your submission does not go through, check for missing information or retake the photo to ensure everything is clear and readable",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-blue-800">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-200 text-blue-800 font-semibold text-[10px]">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>

        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Jane" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="studentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Student ID</FormLabel>
                      <FormControl>
                        <Input placeholder="123456" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="graduationYear"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Graduation Year</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value?.toString()}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select year" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map((year) => (
                            <SelectItem key={year} value={year.toString()}>
                              {year}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Email <span className="text-muted-foreground font-normal">(Optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="jane.doe@student.school.edu" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Volunteer Hours Log Form <span className="text-red-500">*</span>
                </label>
                <div
                  className={`relative border-2 border-dashed rounded-lg p-4 transition-colors ${
                    isScanning
                      ? "border-primary/50 bg-primary/5"
                      : uploadedFile?.scanData?.status === "passed"
                        ? "border-green-300 bg-green-50"
                        : scanFailed
                          ? "border-red-300 bg-red-50"
                          : uploadedFile?.scanData?.status === "warnings"
                            ? "border-amber-300 bg-amber-50"
                            : "border-muted-foreground/30 hover:border-primary/50"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={handleFileChange}
                    disabled={isScanning}
                  />
                  <div className="flex items-center gap-3 pointer-events-none">
                    {isScanning ? (
                      <>
                        <Loader2 className="h-8 w-8 text-primary animate-spin shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-primary">Scanning document...</p>
                          <p className="text-xs text-muted-foreground">
                            Checking for required fields and template compliance
                          </p>
                        </div>
                      </>
                    ) : selectedFileName ? (
                      <>
                        <FileText className="h-8 w-8 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{selectedFileName}</p>
                          <p className="text-xs text-muted-foreground">Click to replace file</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <Upload className="h-8 w-8 text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-sm font-medium">Upload your volunteer log form</p>
                          <p className="text-xs text-muted-foreground">
                            PDF or image (JPG, PNG, WebP) — max 20MB
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {uploadedFile?.scanData && (
                  <ScanResultPanel scan={uploadedFile.scanData} />
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isPending || isScanning || !uploadedFile || scanFailed}
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : isScanning ? (
                  <>
                    <ScanLine className="mr-2 h-4 w-4" />
                    Scanning file...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Submit Hours
                  </>
                )}
              </Button>

              {scanFailed && (
                <p className="text-center text-xs text-red-600">
                  Please resolve the document issues above before submitting.
                </p>
              )}
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
