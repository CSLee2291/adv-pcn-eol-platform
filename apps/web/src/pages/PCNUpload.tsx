import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  FileText,
  Mail,
  Loader2,
  CheckCircle2,
  User,
  Calendar,
  Paperclip,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { uploadPcn, uploadEmail, triggerAnalysis, triggerRules, approveEvent } from "@/services/api";
import { formatDateTime } from "@/lib/utils";

function DropZone({
  accept,
  label,
  hint,
  icon: Icon,
  onFile,
  uploading,
  uploadingText,
}: {
  accept: string;
  label: string;
  hint: string;
  icon: typeof Upload;
  onFile: (file: File) => void;
  uploading: boolean;
  uploadingText: string;
}) {
  const [dragActive, setDragActive] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
      className={`flex flex-col items-center justify-center gap-4 p-12 border-2 border-dashed rounded-panel transition-colors ${
        dragActive
          ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
          : "border-neutral-200 dark:border-neutral-700"
      }`}
    >
      {uploading ? (
        <>
          <Loader2 className="h-10 w-10 text-primary-500 animate-spin" />
          <p className="text-body text-[var(--text-secondary)]">{uploadingText}</p>
        </>
      ) : (
        <>
          <Icon className="h-10 w-10 text-[var(--text-muted)]" />
          <div className="text-center">
            <p className="text-body text-[var(--text-primary)]">{label}</p>
            <p className="text-meta text-[var(--text-muted)] mt-1">{hint}</p>
          </div>
          <label>
            <Button variant="default" asChild>
              <span>
                <FileText className="h-4 w-4" />
                Browse Files
              </span>
            </Button>
            <input type="file" accept={accept} onChange={handleChange} className="hidden" />
          </label>
        </>
      )}
    </div>
  );
}

export function PCNUpload() {
  const navigate = useNavigate();

  // PDF upload state
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfResult, setPdfResult] = useState<any>(null);

  // Email upload state
  const [emailUploading, setEmailUploading] = useState(false);
  const [emailResult, setEmailResult] = useState<any>(null);
  const [approving, setApproving] = useState(false);

  // PDF upload handler (existing flow)
  const handlePdfFile = useCallback(async (file: File) => {
    setPdfUploading(true);
    setPdfResult(null);
    try {
      const event = await uploadPcn(file);
      const aiResult = await triggerAnalysis(event.id);
      const ruleResult = await triggerRules(event.id);
      setPdfResult({ event, aiResult, ruleResult });
    } catch (err: any) {
      setPdfResult({ error: err.response?.data?.error?.message ?? err.message ?? "Upload failed" });
    } finally {
      setPdfUploading(false);
    }
  }, []);

  // Email upload handler
  const handleEmailFile = useCallback(async (file: File) => {
    setEmailUploading(true);
    setEmailResult(null);
    try {
      const result = await uploadEmail(file);
      setEmailResult(result);
    } catch (err: any) {
      setEmailResult({ error: err.response?.data?.error?.message ?? err.message ?? "Upload failed" });
    } finally {
      setEmailUploading(false);
    }
  }, []);

  // Approve & Analyze handler
  const handleApprove = useCallback(async () => {
    if (!emailResult?.id) return;
    setApproving(true);
    try {
      await approveEvent(emailResult.id);
      const aiResult = await triggerAnalysis(emailResult.id);
      const ruleResult = await triggerRules(emailResult.id);
      setEmailResult((prev: any) => ({ ...prev, approved: true, aiResult, ruleResult }));
    } catch (err: any) {
      setEmailResult((prev: any) => ({ ...prev, approveError: err.message }));
    } finally {
      setApproving(false);
    }
  }, [emailResult]);

  return (
    <div className="space-y-6">
      <h1 className="text-title text-[var(--text-primary)]">Upload PCN Document</h1>

      <Tabs defaultValue="pdf">
        <TabsList>
          <TabsTrigger value="pdf" className="gap-1.5">
            <FileText className="h-4 w-4" /> Upload PCN PDF
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-1.5">
            <Mail className="h-4 w-4" /> Upload Outlook Email
          </TabsTrigger>
        </TabsList>

        {/* PDF Tab */}
        <TabsContent value="pdf">
          <Card>
            <CardContent>
              <DropZone
                accept=".pdf"
                label="Drag & drop a PCN PDF here"
                hint="or click Browse Files to select"
                icon={Upload}
                onFile={handlePdfFile}
                uploading={pdfUploading}
                uploadingText="Processing PCN document..."
              />
            </CardContent>
          </Card>

          {pdfResult && !pdfResult.error && (
            <Card>
              <CardHeader><CardTitle>Analysis Result</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-meta text-[var(--text-muted)]">Risk Level</span>
                    <div className="mt-1">
                      <Badge variant={pdfResult.aiResult?.riskLevel?.toLowerCase()}>
                        {pdfResult.aiResult?.riskLevel}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <span className="text-meta text-[var(--text-muted)]">Form / Fit / Function</span>
                    <div className="flex gap-2 mt-1">
                      <Badge variant={pdfResult.aiResult?.formChanged ? "high" : "low"}>
                        Form: {pdfResult.aiResult?.formChanged ? "Changed" : "OK"}
                      </Badge>
                      <Badge variant={pdfResult.aiResult?.fitChanged ? "high" : "low"}>
                        Fit: {pdfResult.aiResult?.fitChanged ? "Changed" : "OK"}
                      </Badge>
                      <Badge variant={pdfResult.aiResult?.functionChanged ? "high" : "low"}>
                        Func: {pdfResult.aiResult?.functionChanged ? "Changed" : "OK"}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div>
                  <span className="text-meta text-[var(--text-muted)]">Summary</span>
                  <p className="text-body text-[var(--text-primary)] mt-1">{pdfResult.aiResult?.summary}</p>
                </div>
                <Button variant="outline" onClick={() => navigate(`/pcn/${pdfResult.event.id}`)}>
                  View Details <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}

          {pdfResult?.error && (
            <Card className="border-red-300 dark:border-red-800">
              <CardContent>
                <p className="text-body text-red-600 dark:text-red-400">{pdfResult.error}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Email Tab */}
        <TabsContent value="email">
          <Card>
            <CardContent>
              <DropZone
                accept=".msg,.eml"
                label="Drag & drop an Outlook Email (.msg or .eml)"
                hint="Email fields and PDF attachments will be automatically extracted"
                icon={Mail}
                onFile={handleEmailFile}
                uploading={emailUploading}
                uploadingText="Parsing email and extracting attachments..."
              />
            </CardContent>
          </Card>

          {emailResult && !emailResult.error && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Email Parsed — Review & Approve</CardTitle>
                  <Badge variant={emailResult.approved ? "low" : "medium"}>
                    {emailResult.approved ? "Approved" : "Pending Review"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Email Preview */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-start gap-3">
                    <User className="h-4 w-4 mt-0.5 text-[var(--text-muted)]" />
                    <div>
                      <p className="text-meta text-[var(--text-muted)]">From</p>
                      <p className="text-body text-[var(--text-primary)]">
                        {emailResult.emailPreview?.fromName
                          ? `${emailResult.emailPreview.fromName} <${emailResult.emailPreview.from}>`
                          : emailResult.emailPreview?.from ?? emailResult.sourceEmail}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Calendar className="h-4 w-4 mt-0.5 text-[var(--text-muted)]" />
                    <div>
                      <p className="text-meta text-[var(--text-muted)]">Date</p>
                      <p className="text-body text-[var(--text-primary)]">
                        {emailResult.emailPreview?.date
                          ? formatDateTime(emailResult.emailPreview.date)
                          : formatDateTime(emailResult.receivedDate)}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-meta text-[var(--text-muted)]">Subject</p>
                  <p className="text-body font-medium text-[var(--text-primary)]">
                    {emailResult.emailPreview?.subject ?? emailResult.pcnTitle}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-meta text-[var(--text-muted)]">Vendor (auto-detected)</p>
                    <p className="text-body text-[var(--text-primary)]">{emailResult.vendorName}</p>
                  </div>
                  <div>
                    <p className="text-meta text-[var(--text-muted)]">PCN Number (auto-detected)</p>
                    <p className="text-body text-[var(--text-primary)]">{emailResult.pcnNumber}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-[var(--text-muted)]" />
                  <span className="text-meta text-[var(--text-muted)]">
                    {emailResult.emailPreview?.attachmentCount ?? 0} attachment(s),{" "}
                    {emailResult.emailPreview?.pdfCount ?? 0} PDF(s) extracted
                  </span>
                </div>

                {/* Approve / Analyze */}
                {!emailResult.approved ? (
                  <div className="flex gap-3 pt-2">
                    <Button onClick={handleApprove} disabled={approving}>
                      {approving ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing...</>
                      ) : (
                        <><CheckCircle2 className="h-4 w-4" /> Approve &amp; Analyze</>
                      )}
                    </Button>
                    <Button variant="outline" onClick={() => navigate(`/pcn/${emailResult.id}`)}>
                      Save as Draft
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="text-body font-medium">
                        Approved — AI Analysis & Rule Engine completed
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-meta text-[var(--text-muted)]">Risk Level</span>
                        <div className="mt-1">
                          <Badge variant={emailResult.aiResult?.riskLevel?.toLowerCase()}>
                            {emailResult.aiResult?.riskLevel}
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <span className="text-meta text-[var(--text-muted)]">Form / Fit / Function</span>
                        <div className="flex gap-2 mt-1">
                          <Badge variant={emailResult.aiResult?.formChanged ? "high" : "low"}>
                            Form: {emailResult.aiResult?.formChanged ? "Changed" : "OK"}
                          </Badge>
                          <Badge variant={emailResult.aiResult?.fitChanged ? "high" : "low"}>
                            Fit: {emailResult.aiResult?.fitChanged ? "Changed" : "OK"}
                          </Badge>
                          <Badge variant={emailResult.aiResult?.functionChanged ? "high" : "low"}>
                            Func: {emailResult.aiResult?.functionChanged ? "Changed" : "OK"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" onClick={() => navigate(`/pcn/${emailResult.id}`)}>
                      View Details <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {emailResult.approveError && (
                  <p className="text-body text-red-600 dark:text-red-400">{emailResult.approveError}</p>
                )}
              </CardContent>
            </Card>
          )}

          {emailResult?.error && (
            <Card className="border-red-300 dark:border-red-800">
              <CardContent>
                <p className="text-body text-red-600 dark:text-red-400">{emailResult.error}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
