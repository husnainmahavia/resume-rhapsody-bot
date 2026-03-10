import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Loader2, LogOut, Mail, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Session } from "@supabase/supabase-js";

interface AuthGateProps {
  children: React.ReactNode;
}

export default function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setLoading(false);
      }
    );
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast({
          title: "Check your email",
          description: "A verification link has been sent to your email address.",
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast({ title: "Logged in", description: "You can now edit your profile." });
      }
    } catch (err: any) {
      toast({ title: "Auth error", description: err.message, variant: "destructive" });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (session) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Lock className="h-3 w-3 text-primary" />
            Authenticated as <span className="font-mono text-foreground">{session.user.email}</span>
          </span>
          <Button size="sm" variant="ghost" onClick={handleLogout} className="gap-1 h-7 text-xs">
            <LogOut className="h-3 w-3" /> Logout
          </Button>
        </div>
        {children}
      </div>
    );
  }

  return (
    <Card className="max-w-sm mx-auto border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Lock className="h-4 w-4 text-primary" />
          {isSignUp ? "Create Account" : "Login Required"}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {isSignUp
            ? "Create an account to manage your profile."
            : "Sign in to edit your profile details."}
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleAuth} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Email</Label>
            <div className="relative">
              <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="pl-9 bg-secondary/30"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Password</Label>
            <div className="relative">
              <KeyRound className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="pl-9 bg-secondary/30"
              />
            </div>
          </div>
          <Button type="submit" disabled={authLoading} className="w-full gap-2">
            {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            {isSignUp ? "Sign Up" : "Sign In"}
          </Button>
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
