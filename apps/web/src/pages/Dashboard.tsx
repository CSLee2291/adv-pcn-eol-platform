import { useState, useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { KpiStrip } from "@/components/dashboard/KpiStrip";
import { MainChart } from "@/components/dashboard/MainChart";
import { SecondaryCards } from "@/components/dashboard/SecondaryCards";
import { Button } from "@/components/ui/button";
import { fetchKpi } from "@/services/api";
import type { DashboardKpi } from "shared/types";

export function Dashboard() {
  const [kpi, setKpi] = useState<DashboardKpi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = () => {
    setLoading(true);
    setError("");
    fetchKpi()
      .then(setKpi)
      .catch((err) => setError(err.response?.data?.error?.message ?? err.message ?? "Failed to load dashboard"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-title text-[var(--text-primary)]">Dashboard</h1>
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-panel border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-body text-red-600 dark:text-red-400 flex-1">{error}</p>
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </div>
      )}
      <KpiStrip data={kpi} loading={loading} />
      <MainChart />
      <SecondaryCards />
    </div>
  );
}
