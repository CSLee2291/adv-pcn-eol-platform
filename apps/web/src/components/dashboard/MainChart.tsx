import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// Sample data — will be replaced with real API data
const sampleData = [
  { month: "Jan", pcnEvents: 12, eolEvents: 3, highRisk: 2 },
  { month: "Feb", pcnEvents: 19, eolEvents: 5, highRisk: 4 },
  { month: "Mar", pcnEvents: 15, eolEvents: 2, highRisk: 1 },
  { month: "Apr", pcnEvents: 8, eolEvents: 1, highRisk: 3 },
  { month: "May", pcnEvents: 22, eolEvents: 6, highRisk: 5 },
  { month: "Jun", pcnEvents: 17, eolEvents: 4, highRisk: 2 },
];

export function MainChart() {
  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle>PCN Event Trends</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={sampleData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="fillPcn" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4461EC" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#4461EC" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="fillEol" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EC4899" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#EC4899" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-divider)" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 12, fill: "var(--text-muted)" }}
              axisLine={{ stroke: "var(--surface-divider)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: "var(--text-muted)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "12px",
                border: "none",
                boxShadow: "var(--shadow-card)",
                backgroundColor: "var(--surface-card)",
                color: "var(--text-primary)",
                padding: "12px 16px",
              }}
            />
            <Area
              type="monotone"
              dataKey="pcnEvents"
              stroke="#4461EC"
              strokeWidth={2}
              fill="url(#fillPcn)"
              name="PCN Events"
            />
            <Area
              type="monotone"
              dataKey="eolEvents"
              stroke="#EC4899"
              strokeWidth={2}
              fill="url(#fillEol)"
              name="EOL Events"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
