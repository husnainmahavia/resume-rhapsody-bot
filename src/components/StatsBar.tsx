import { motion } from "framer-motion";
import { Briefcase, Search, FileText, Mail, BarChart3, Zap } from "lucide-react";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}

function StatCard({ icon, label, value, color }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-lg p-4 flex items-center gap-3"
    >
      <div className={`p-2 rounded-md ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-xl font-bold font-mono">{value}</p>
      </div>
    </motion.div>
  );
}

interface StatsBarProps {
  applications: Array<{ status: string }>;
}

export default function StatsBar({ applications }: StatsBarProps) {
  const total = applications.length;
  const applied = applications.filter((a) => ["applied", "email_sent", "cv_tailored"].includes(a.status)).length;
  const interviews = applications.filter((a) => a.status === "interview").length;
  const offers = applications.filter((a) => a.status === "offer").length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard
        icon={<Briefcase className="h-4 w-4" />}
        label="Total Jobs"
        value={total}
        color="bg-primary/20 text-primary"
      />
      <StatCard
        icon={<Mail className="h-4 w-4" />}
        label="Applied"
        value={applied}
        color="bg-info/20 text-info"
      />
      <StatCard
        icon={<BarChart3 className="h-4 w-4" />}
        label="Interviews"
        value={interviews}
        color="bg-warning/20 text-warning"
      />
      <StatCard
        icon={<Zap className="h-4 w-4" />}
        label="Offers"
        value={offers}
        color="bg-success/20 text-success"
      />
    </div>
  );
}
