import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { Loader2, ArrowLeft, FileCheck, Check, X, Save } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetSubmission, 
  useUpdateSubmission,
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
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<SubmissionUpdateStatus>("pending");
  const [isEditing, setIsEditing] = useState(false);

  // Initialize state when submission data loads
  if (submission && !isEditing) {
    setNotes(submission.notes || "");
    setStatus(submission.status as SubmissionUpdateStatus);
    setIsEditing(true);
  }

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
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
              {submission.extractedOrg && (
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

        <div className="lg:col-span-2">
          <Card className="h-[calc(100vh-12rem)] flex flex-col overflow-hidden">
            <CardHeader className="py-3 px-4 border-b bg-muted/30">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span>Document Viewer</span>
                <span className="text-xs font-normal text-muted-foreground max-w-[300px] truncate" title={submission.fileName}>
                  {submission.fileName}
                </span>
              </CardTitle>
            </CardHeader>
            <div className="flex-1 p-0 relative bg-muted/10">
              {submission.fileUrl.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                <div className="absolute inset-0 flex items-center justify-center p-4">
                  <img 
                    src={submission.fileUrl} 
                    alt="Proof of hours" 
                    className="max-w-full max-h-full object-contain rounded-md shadow-sm border"
                  />
                </div>
              ) : (
                <iframe 
                  src={submission.fileUrl} 
                  className="w-full h-full border-0" 
                  title="Document Preview"
                />
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
