import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import {
  CheckCircle2,
  Upload,
  Loader2,
  FileText,
  X,
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
  studentId: z.string().regex(/^\d{10}$/, "Student ID must be exactly 10 digits"),
  graduationYear: z.coerce.number().min(2024).max(2030),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
});

interface UploadedFile {
  fileUrl: string;
  fileName: string;
}

export default function SubmissionForm() {
  useEffect(() => {
    document.title = "ServiceSync";
  }, []);

  const [showInstructions, setShowInstructions] = useState(true);

  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
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
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/submissions/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");

      const data = await res.json();
      setUploadedFile({ fileUrl: data.fileUrl, fileName: data.fileName });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: "There was an error uploading your file. Please try again.",
        variant: "destructive",
      });
      setSelectedFileName(null);
    } finally {
      setIsUploading(false);
    }
  }

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!uploadedFile) {
      toast({ title: "No file uploaded", description: "Please select a file first.", variant: "destructive" });
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
        },
      });

      setSuccessData({ id: submission.submissionId, timestamp: new Date() });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const isCollision = msg.includes("ID_COLLISION") || msg.includes("409");
      toast({
        title: isCollision ? "Please try submitting again" : "Submission failed",
        description: isCollision
          ? "A rare reference ID conflict occurred. Your form is still filled in — just click Submit again."
          : "There was an error submitting your hours. Please try again.",
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

        {showInstructions && (
          <div className="mx-6 mb-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 relative">
            <button
              type="button"
              onClick={() => setShowInstructions(false)}
              className="absolute top-2 right-2 text-blue-400 hover:text-blue-700 transition-colors"
              aria-label="Dismiss instructions"
            >
              <X className="h-3.5 w-3.5" />
            </button>
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
        )}

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
                        <Input placeholder="06********" maxLength={10} inputMode="numeric" {...field} />
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
                    isUploading
                      ? "border-primary/50 bg-primary/5"
                      : uploadedFile
                        ? "border-green-300 bg-green-50"
                        : "border-muted-foreground/30 hover:border-primary/50"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={handleFileChange}
                    disabled={isUploading}
                  />
                  <div className="flex items-center gap-3 pointer-events-none">
                    {isUploading ? (
                      <>
                        <Loader2 className="h-8 w-8 text-primary animate-spin shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-primary">Uploading...</p>
                          <p className="text-xs text-muted-foreground">Please wait</p>
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
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isPending || isUploading || !uploadedFile}
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Submit Hours
                  </>
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
