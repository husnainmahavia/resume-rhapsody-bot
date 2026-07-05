import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Lock, FileText, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { Session } from "@supabase/supabase-js";
import ApplicantProfileForm from "./ApplicantProfileForm";

interface Props {
  children: React.ReactNode;
}

type ProfileState = "loading" | "missing" | "ready";

export default function OnboardingGuard({ children }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileState, setProfileState] = useState<ProfileState>("loading");
  const [skipped, setSkipped] = useState<boolean>(() => sessionStorage.getItem("skipOnboarding") === "1");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();


  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setAuthLoading(false);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const checkProfile = async () => {
    setProfileState("loading");
    const { data } = await supabase
      .from("applicant_profile")
      .select("id, name, email, cv_content")
      .limit(1)
      .maybeSingle();
    const ok = data && data.name && data.email && (data.cv_content?.length ?? 0) > 50;
    setProfileState(ok ? "ready" : "missing");
  };

  useEffect(() => {
    if (session) checkProfile();
    else setProfileState("loading");
  }, [session]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin + "/app" },
        });
        if (error) throw error;
        toast({ title: "Check your email", description: "Verify your address to continue." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      toast({ title: "Auth error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || (session && profileState === "loading")) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <Card className="w-full max-w-sm border-primary/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              {isSignUp ? "Create Account" : "Sign in to continue"}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              You must be signed in to use AutoApply Copilot.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuth} className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
              <Button type="submit" disabled={submitting} className="w-full gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {isSignUp ? "Sign Up" : "Sign In"}
              </Button>
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="w-full text-xs text-muted-foreground hover:text-foreground"
              >
                {isSignUp ? "Have an account? Sign in" : "Need an account? Sign up"}
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (profileState === "missing" && !skipped) {
    return (
      <div className="min-h-[80vh] max-w-2xl mx-auto p-4 space-y-4">
        <Card className="border-warning/40 bg-warning/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-warning" />
              Complete your applicant profile
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Job discovery, CV tailoring, and outreach are disabled until your name, email,
              and CV content are saved. This ensures every application has real data — no placeholders.
            </p>
          </CardHeader>
        </Card>
        <ApplicantProfileForm />
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              sessionStorage.setItem("skipOnboarding", "1");
              setSkipped(true);
            }}
          >
            Skip for now → back to app
          </Button>
          <Button size="sm" variant="outline" onClick={checkProfile}>
            I've saved my profile — continue
          </Button>
        </div>
      </div>
    );
  }


  return <>{children}</>;
}
