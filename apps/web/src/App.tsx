import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Dashboard } from "@/pages/Dashboard";
import { PCNEvents } from "@/pages/PCNEvents";
import { PCNUpload } from "@/pages/PCNUpload";
import { PCNDetail } from "@/pages/PCNDetail";
import { AnalysisResult } from "@/pages/AnalysisResult";
import { WhereUsed } from "@/pages/WhereUsed";
import { CaseManagement } from "@/pages/CaseManagement";
import { NotificationRules } from "@/pages/NotificationRules";
import { NotificationConfig } from "@/pages/NotificationConfig";
import { PCNVerification } from "@/pages/PCNVerification";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pcn" element={<PCNEvents />} />
          <Route path="/pcn/upload" element={<PCNUpload />} />
          <Route path="/pcn/:id" element={<PCNDetail />} />
          <Route path="/analysis" element={<AnalysisResult />} />
          <Route path="/analysis/:eventId" element={<AnalysisResult />} />
          <Route path="/where-used" element={<WhereUsed />} />
          <Route path="/notifications" element={<NotificationRules />} />
          <Route path="/notifications/config" element={<NotificationConfig />} />
          <Route path="/verification" element={<PCNVerification />} />
          <Route path="/cases" element={<CaseManagement />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
