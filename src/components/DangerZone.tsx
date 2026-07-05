import { useState } from "react";
import { Trash2, AlertTriangle, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const CONFIRM_PHRASE = "DELETE MY DATA";

const CLEAR_TABLES = [
  "job_applications",
  "email_review_queue",
  "email_tracking",
  "sent_emails",
  "linkedin_outreach",
  "email_engine_leads",
  "scraped_companies",
  "domain_blacklist",
] as const;

export default function DangerZone() {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [alsoProfile, setAlsoProfile] = useState(false);
  const { toast } = useToast();

  const canDelete = confirm.trim() === CONFIRM_PHRASE;

  const handleDelete = async () => {
    if (!canDelete) return;
    setBusy(true);
    try {
      for (const table of CLEAR_TABLES) {
        const { error } = await supabase
          .from(table)
          .delete()
          .not("id", "is", null);
        if (error) throw new Error(`${table}: ${error.message}`);
      }
      if (alsoProfile) {
        await supabase
          .from("applicant_profile")
          .update({
            name: "",
            email: "",
            phone: "",
            location: "",
            title: "",
            years_experience: "",
            skills: [],
            summary: "",
            cv_content: "",
          })
          .not("id", "is", null);
      }
      toast({
        title: "All data deleted",
        description: `Cleared ${CLEAR_TABLES.length} tables${alsoProfile ? " + profile" : ""}.`,
      });
      setConfirm("");
      setTimeout(async () => {
        await supabase.auth.signOut();
        window.location.href = "/";
      }, 800);
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Danger Zone — Delete My Data
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Permanently deletes all applications, review queue, sent emails, tracking, LinkedIn
          outreach, scraped companies, leads, and blacklist entries. This cannot be undone.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={alsoProfile}
            onChange={e => setAlsoProfile(e.target.checked)}
            className="accent-destructive"
          />
          Also clear my applicant profile (name, CV, skills)
        </label>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            Type <span className="font-mono font-bold text-destructive">{CONFIRM_PHRASE}</span> to confirm:
          </p>
          <Input
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            className="bg-background font-mono"
          />
        </div>
        <Button
          variant="destructive"
          className="w-full gap-2"
          disabled={!canDelete || busy}
          onClick={handleDelete}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Delete everything & sign out
        </Button>
        <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1">
          <LogOut className="h-2.5 w-2.5" /> You will be signed out and redirected home.
        </p>
      </CardContent>
    </Card>
  );
}
