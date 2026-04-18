import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { Loader2, ArrowLeft, FileCheck, Check, X, Save, AlertCircle, AlertTriangle, CheckCircle2, ScanLine, Trash2, RotateCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetSubmission, 
  useUpdateSubmission,
  useDeleteSubmission,
  getGetSubmissionQueryKey,
  getGetSubmissionStatsQueryKey,
  getListSubmissionsQueryKey,
  SubmissionUpdateStatus
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface FieldResult { found: boolean; value: string | null; }
interface ScanData {
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

const CRITICAL_HEADER_FIELDS: Array<[keyof ScanData["fields"], string]> = [
  ["studentName", "Student name"],
  ["studentNumber", "Student number"],
  ["totalHoursVolunteered", "Total hours worked"],
];

const MINOR_HEADER_FIELDS: Array<[keyof ScanData["fields"], string]> = [
  ["graduationYear", "Graduation year"],
  ["schoolName", "School name"],
  ["schoolYear", "School year"],
  ["gradeLevel", "Grade level"],
  ["organization", "Organization name"],
];

function entryIssues(entry: ScanData["entries"][number]): { critical: string[]; minor: string[] } {
  const critical: string[] = [];
  const minor: string[] = [];
  if (!entry.activity) critical.push("Activity");
  if (!entry.contactName) critical.push("Contact");
  if (!entry.date) minor.push("Date");
  if (!entry.timeIn) minor.push("Time In");
  if (!entry.timeOut) minor.push("Time Out");
  if (!entry.hours) minor.push("Hours");
  if (!entry.hasSignature) minor.push("Signature");
  return { critical, minor };
}

function ScanPanel({ scan }: { scan: ScanData }) {
  const criticalIssues: string[] = [];
  const minorIssues: string[] = [];

  if (!scan.isCorrectTemplate) {
    criticalIssues.push("Document does not appear to be the correct volunteer log template");
  } else if (!scan.isLegible) {
    criticalIssues.push("Document is not legible — unable to read fields");
  } else {
    for (const [key, label] of CRITICAL_HEADER_FIELDS) {
      if (!scan.fields[key]?.found) criticalIssues.push(`${label} not detected`);
    }
    for (const [key, label] of MINOR_HEADER_FIELDS) {
      if (!scan.fields[key]?.found) minorIssues.push(`${label} not detected`);
    }

    const missingActivity = scan.entries.filter(e => !e.activity).length;
    const missingContact = scan.entries.filter(e => !e.contactName).length;
    if (missingActivity > 0) criticalIssues.push(`Activity missing on ${missingActivity} log entr${missingActivity === 1 ? "y" : "ies"}`);
    if (missingContact > 0) criticalIssues.push(`Contact missing on ${missingContact} log entr${missingContact === 1 ? "y" : "ies"}`);

    const missingDate = scan.entries.filter(e => !e.date).length;
    const missingTimeIn = scan.entries.filter(e => !e.timeIn).length;
    const missingTimeOut = scan.entries.filter(e => !e.timeOut).length;
    const missingHours = scan.entries.filter(e => !e.hours).length;
    const missingSignature = scan.entries.filter(e => !e.hasSignature).length;
    if (missingDate > 0) minorIssues.push(`Date missing on ${missingDate} entr${missingDate === 1 ? "y" : "ies"}`);
    if (missingTimeIn > 0) minorIssues.push(`Time In missing on ${missingTimeIn} entr${missingTimeIn === 1 ? "y" : "ies"}`);
    if (missingTimeOut > 0) minorIssues.push(`Time Out missing on ${missingTimeOut} entr${missingTimeOut === 1 ? "y" : "ies"}`);
    if (missingHours > 0) minorIssues.push(`Hours missing on ${missingHours} entr${missingHours === 1 ? "y" : "ies"}`);
    if (missingSignature > 0) minorIssues.push(`Signature missing on ${missingSignature} entr${missingSignature === 1 ? "y" : "ies"}`);

    scan.warnings.forEach(w => minorIssues.push(w));
    scan.errors.forEach(e => minorIssues.push(e));
  }

  const hasCritical = criticalIssues.length > 0;
  const hasMinor = minorIssues.length > 0;
  const isAllGood = !hasCritical && !hasMinor;

  const overallBadge = hasCritical
    ? <Badge variant="destructive">Critical Issues</Badge>
    : hasMinor
      ? <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Minor Issues</Badge>
      : <Badge className="bg-green-100 text-green-800 hover:bg-green-100">All Good</Badge>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ScanLine className="h-4 w-4 text-primary" />
          <span>Document Scan</span>
        </div>
        {overallBadge}
      </div>

      {isAllGood && (
        <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>No issues detected — all required fields present.</span>
        </div>
      )}

      {hasCritical && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Critical</p>
          <ul className="space-y-1">
            {criticalIssues.map((issue, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />{issue}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasMinor && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Minor Issues</p>
          <ul className="space-y-1">
            {minorIssues.map((issue, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />{issue}
              </li>
            ))}
          </ul>
        </div>
      )}

      {scan.isCorrectTemplate && scan.isLegible && scan.entries && scan.entries.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            Log Entries ({scan.entries.length})
          </p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {scan.entries.map((entry, i) => {
              const { critical, minor } = entryIssues(entry);
              const rowColor = critical.length > 0
                ? "bg-red-50 border border-red-200"
                : minor.length > 0
                  ? "bg-amber-50 border border-amber-200"
                  : "bg-green-50 border border-green-200";
              return (
                <div key={i} className={`text-xs rounded px-2 py-1.5 space-y-0.5 ${rowColor}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={entry.date ? "text-muted-foreground" : "text-amber-600 font-medium"}>
                      {entry.date ?? "No date"}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{entry.hours ?? "—"}h</span>
                      <span className={entry.hasSignature ? "text-green-600" : "text-amber-600"}>
                        {entry.hasSignature ? "Signed" : "No sig"}
                      </span>
                    </div>
                  </div>
                  <div className={`break-words whitespace-normal ${entry.activity ? "text-foreground/80" : "text-red-600 font-medium"}`}>
                    {entry.activity ?? "No activity"}
                  </div>
                  {entry.contactName && (
                    <div className="text-muted-foreground">{entry.contactName}</div>
                  )}
                  {!entry.contactName && (
                    <div className="text-red-600 font-medium">No contact</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SubmissionDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const numericId = parseInt(id || "0", 10);
  
  const { data: submission, isLoading } = useGetSubmission(numericId, {
    query: {
      enabled: !!numericId,
      queryKey: getGetSubmissionQueryKey(numericId)
    }
  });

  const updateSubmission = useUpdateSubmission();
  const deleteSubmission = useDeleteSubmission();
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<SubmissionUpdateStatus>("pending");
  const [initialized, setInitialized] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [imageRotation, setImageRotation] = useState(0);

  useEffect(() => {
    if (submission && !initialized) {
      setNotes(submission.notes || "");
      setStatus(submission.status as SubmissionUpdateStatus);
      setInitialized(true);
    }
  }, [submission?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpdate = async () => {
    try {
      await updateSubmission.mutateAsync({
        id: numericId,
        data: { status, notes: notes || null }
      });
      
      // Update local cache
      queryClient.setQueryData(getGetSubmissionQueryKey(numericId), (old: any) => 
        old ? { ...old, status, notes } : old
      );
      
      // Invalidate lists and stats
      queryClient.invalidateQueries({ queryKey: getListSubmissionsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetSubmissionStatsQueryKey() });
      
      toast({
        title: "Submission updated",
        description: "The submission status has been saved.",
      });
    } catch (error) {
      toast({
        title: "Update failed",
        description: "There was an error updating the submission.",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteSubmission.mutateAsync({ id: numericId });
      queryClient.invalidateQueries({ queryKey: getListSubmissionsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetSubmissionStatsQueryKey() });
      toast({ title: "Submission deleted", description: "The submission has been permanently removed." });
      setLocation("/admin");
    } catch {
      toast({ title: "Delete failed", description: "There was an error deleting the submission.", variant: "destructive" });
    }
  };

  const setStatusAndSave = async (newStatus: SubmissionUpdateStatus) => {
    setStatus(newStatus);
    try {
      await updateSubmission.mutateAsync({
        id: numericId,
        data: { status: newStatus, notes: notes || null }
      });
      
      queryClient.setQueryData(getGetSubmissionQueryKey(numericId), (old: any) => 
        old ? { ...old, status: newStatus, notes } : old
      );
      queryClient.invalidateQueries({ queryKey: getListSubmissionsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetSubmissionStatsQueryKey() });
      
      toast({
        title: "Status updated",
        description: `Submission marked as ${newStatus}.`,
      });
    } catch (error) {
      toast({
        title: "Update failed",
        description: "There was an error updating the submission.",
        variant: "destructive"
      });
    }
  };

  if (isLoading || !submission) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/admin")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">Review Submission</h1>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            className="border-gray-200 text-gray-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200"
            onClick={() => setDeleteConfirmOpen(true)}
            disabled={deleteSubmission.isPending}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
          <Button 
            variant="outline" 
            className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
            onClick={() => setStatusAndSave("rejected")}
            disabled={updateSubmission.isPending}
          >
            <X className="h-4 w-4 mr-2" />
            Reject
          </Button>
          <Button 
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={() => setStatusAndSave("approved")}
            disabled={updateSubmission.isPending}
          >
            <Check className="h-4 w-4 mr-2" />
            Approve
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Student Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <div className="text-muted-foreground mb-1">Name</div>
                <div className="font-medium text-base">{submission.firstName} {submission.lastName}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Student ID</div>
                <div className="font-medium">{submission.studentId}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Graduation Year</div>
                <div className="font-medium">{submission.graduationYear}</div>
              </div>
              {submission.email && (
                <div>
                  <div className="text-muted-foreground mb-1">Email</div>
                  <div className="font-medium">{submission.email}</div>
                </div>
              )}
              <Separator />
              <div>
                <div className="text-muted-foreground mb-1">Submitted On</div>
                <div className="font-medium">{format(new Date(submission.createdAt), "MMM d, yyyy h:mm a")}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Reference ID</div>
                <div className="font-mono text-xs">{submission.submissionId}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Review Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {submission.scanData ? (() => {
                try {
                  const scan: ScanData = typeof submission.scanData === "string"
                    ? JSON.parse(submission.scanData)
                    : submission.scanData as unknown as ScanData;
                  return (
                    <div className="border rounded-lg p-3 bg-muted/20">
                      <ScanPanel scan={scan} />
                    </div>
                  );
                } catch { return null; }
              })() : submission.scanStatus === "pending" ? (
                <div className="border rounded-lg p-3 bg-muted/20 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>AI document scan in progress&hellip;</span>
                </div>
              ) : null}

              {submission.extractedOrg && !submission.scanData && submission.scanStatus !== "pending" && (
                <div className="bg-primary/5 p-3 rounded-md border border-primary/10">
                  <div className="flex items-center gap-2 text-primary font-medium mb-1">
                    <FileCheck className="h-4 w-4" />
                    <span>Extracted Data</span>
                  </div>
                  <div className="text-sm grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <span className="text-muted-foreground text-xs block">Organization</span>
                      <span>{submission.extractedOrg}</span>
                    </div>
                    {submission.extractedHours && (
                      <div>
                        <span className="text-muted-foreground text-xs block">Hours</span>
                        <span>{submission.extractedHours}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={status} onValueChange={(val: any) => setStatus(val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending Review</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Internal Notes</label>
                <Textarea 
                  placeholder="Add notes for other reviewers..." 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="min-h-[100px] resize-y"
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                onClick={handleUpdate} 
                disabled={updateSubmission.isPending} 
                className="w-full"
              >
                {updateSubmission.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Changes
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="lg:col-span-3">
          {(() => {
            const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(submission.fileName);
            return (
              <Card className="h-[calc(100vh-12rem)] flex flex-col overflow-hidden">
                <CardHeader className="py-3 px-4 border-b bg-muted/30">
                  <CardTitle className="text-sm font-medium flex items-center justify-between">
                    <span>Document Viewer</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-normal text-muted-foreground max-w-[200px] truncate" title={submission.fileName}>
                        {submission.fileName}
                      </span>
                      {isImage && (
                        <button
                          onClick={() => setImageRotation(r => r - 90)}
                          className="flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground transition-colors"
                          title="Rotate 90° counterclockwise"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Rotate
                        </button>
                      )}
                      <a
                        href={submission.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-normal text-primary hover:underline flex items-center gap-1"
                      >
                        Open in new tab ↗
                      </a>
                    </div>
                  </CardTitle>
                </CardHeader>
                <div className="flex-1 p-0 relative bg-muted/10 overflow-hidden">
                  {isImage ? (
                    <div className="absolute inset-0 flex items-center justify-center p-4">
                      <img
                        src={submission.fileUrl}
                        alt="Proof of hours"
                        className="object-contain rounded-md shadow-sm border"
                        style={{
                          transform: `rotate(${imageRotation}deg)`,
                          transition: "transform 0.3s ease",
                          maxHeight: Math.abs(imageRotation) % 180 === 90 ? "80vw" : "100%",
                        }}
                      />
                    </div>
                  ) : (
                    <object
                      data={submission.fileUrl}
                      type="application/pdf"
                      className="w-full h-full"
                      title="Document Preview"
                    >
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-muted-foreground">
                        <p className="text-sm">PDF preview is not available in this browser.</p>
                        <a
                          href={submission.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary font-medium hover:underline"
                        >
                          Click here to open the file ↗
                        </a>
                      </div>
                    </object>
                  )}
                </div>
              </Card>
            );
          })()}
        </div>
      </div>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this submission?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the submission for{" "}
              <span className="font-medium text-foreground">
                {submission.firstName} {submission.lastName}
              </span>{" "}
              (ID: {submission.submissionId}). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDelete}
            >
              {deleteSubmission.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete submission
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
