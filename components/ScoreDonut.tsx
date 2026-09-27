import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

interface ScoreDonutProps {
  score: number; // 0-100
}

function colorForScore(score: number): string {
  if (score >= 75) return "#059669"; // emerald-600
  if (score >= 50) return "#d97706"; // amber-600
  return "#dc2626"; // red-600
}

export function ScoreDonut({ score }: ScoreDonutProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const data = [
    { name: "Score", value: clamped },
    { name: "Remaining", value: 100 - clamped },
  ];
  const scoreColor = colorForScore(clamped);

  return (
    <div className="relative mx-auto h-44 w-44">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            innerRadius={58}
            outerRadius={78}
            startAngle={90}
            endAngle={-270}
            stroke="none"
            isAnimationActive
          >
            <Cell fill={scoreColor} />
            <Cell fill="#e5e7eb" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-gray-900">{clamped}</span>
        <span className="text-xs font-medium text-gray-500">out of 100</span>
      </div>
    </div>
  );
}
