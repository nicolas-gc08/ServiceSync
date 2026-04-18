import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { CheckCircle2, Upload, File, Loader2 } from "lucide-react";
import { useCreateSubmission } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const MAX_FILE_SIZE = 5000000;
const ACCEPTED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

const formSchema = z.object({
  firstName: z.string().min(2, "First name is required"),
  lastName: z.string().min(2, "Last name is required"),
  studentId: z.string().min(4, "Student ID is required"),
  graduationYear: z.coerce.number().min(2024).max(2030),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  file: z.any()
    .refine((file) => !!file, "File is required")
    .refine((file) => !file || file.size <= MAX_FILE_SIZE, "Max file size is 5MB.")
    .refine(
      (file) => ACCEPTED_FILE_TYPES.includes(file?.type),
      "Only .pdf, .jpg, .jpeg, .png and .webp formats are supported."
    )
});

export default function SubmissionForm() {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [successData, setSuccessData] = useState<{ id: string, timestamp: Date } | null>(null);
  
  const createSubmission = useCreateSubmission();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      studentId: "",
      graduationYear: new Date().getFullYear(),
      email: "",
      file: undefined
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      setIsUploading(true);
      
      const formData = new FormData();
      formData.append("file", values.file);
      
      const uploadRes = await fetch("/api/submissions/upload", {
        method: "POST",
        body: formData,
      });
      
      if (!uploadRes.ok) {
        throw new Error("Failed to upload file");
      }
      
      const { fileUrl, fileName } = await uploadRes.json();
      
      const submission = await createSubmission.mutateAsync({
        data: {
          firstName: values.firstName,
          lastName: values.lastName,
          studentId: values.studentId,
          graduationYear: values.graduationYear,
          email: values.email || null,
          fileUrl,
          fileName
        }
      });
      
      setSuccessData({
        id: submission.submissionId,
        timestamp: new Date()
      });
      
    } catch (error) {
      toast({
        title: "Submission failed",
        description: "There was an error submitting your hours. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
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
            <Button className="w-full" onClick={() => {
              form.reset();
              setSuccessData(null);
            }}>
              Submit Another
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const isPending = isUploading || createSubmission.isPending;

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50/50 p-4 py-12">
      <Card className="w-full max-w-xl shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold tracking-tight text-primary">Volunteer Hours</CardTitle>
          <CardDescription>
            Submit your community service hours for faculty review.
          </CardDescription>
        </CardHeader>
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
                    <FormLabel>Email <span className="text-muted-foreground font-normal">(Optional)</span></FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="jane.doe@student.school.edu" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="file"
                render={({ field: { value, onChange, ...field } }) => (
                  <FormItem>
                    <FormLabel>Proof of Hours</FormLabel>
                    <FormControl>
                      <div className="grid w-full items-center gap-1.5">
                        <Input 
                          type="file" 
                          accept=".pdf,.jpg,.jpeg,.png,.webp"
                          className="cursor-pointer file:cursor-pointer file:bg-primary/10 file:text-primary file:border-0 file:rounded-md file:px-4 file:py-1 file:mr-4 file:font-medium hover:file:bg-primary/20 transition-colors"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) onChange(file);
                          }}
                          {...field} 
                        />
                        <p className="text-xs text-muted-foreground">Upload a signed form or certificate (PDF or Image, max 5MB).</p>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={isPending}>
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
