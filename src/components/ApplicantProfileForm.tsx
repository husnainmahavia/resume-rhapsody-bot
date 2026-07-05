import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { User, Save, Loader2, Plus, X, Info, Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { parseCvFile, extractCvMeta } from "@/lib/cvParser";
import DangerZone from "./DangerZone";

interface ProfileData {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  title: string;
  years_experience: string;
  skills: string[];
  summary: string;
  cv_content: string;
}

export default function ApplicantProfileForm() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [newSkill, setNewSkill] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("applicant_profile")
        .select("*")
        .limit(1)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      if (data) {
        setProfile(data as unknown as ProfileData);
      }
    } catch (e) {
      console.error("Failed to load profile:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("applicant_profile")
        .update({
          name: profile.name,
          email: profile.email,
          phone: profile.phone,
          location: profile.location,
          title: profile.title,
          years_experience: profile.years_experience,
          skills: profile.skills,
          summary: profile.summary,
          cv_content: profile.cv_content,
        })
        .eq("id", profile.id);
      if (error) throw error;
      toast({ title: "Profile saved", description: "Your profile has been updated. The pipeline will use this info." });
    } catch (e) {
      toast({ title: "Save failed", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addSkill = () => {
    if (!newSkill.trim() || !profile) return;
    if (profile.skills.includes(newSkill.trim())) return;
    setProfile({ ...profile, skills: [...profile.skills, newSkill.trim()] });
    setNewSkill("");
  };

  const removeSkill = (skill: string) => {
    if (!profile) return;
    setProfile({ ...profile, skills: profile.skills.filter(s => s !== skill) });
  };

  const update = (field: keyof ProfileData, value: string) => {
    if (!profile) return;
    setProfile({ ...profile, [field]: value });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 10 MB.", variant: "destructive" });
      return;
    }
    setParsing(true);
    try {
      const text = await parseCvFile(file);
      const meta = extractCvMeta(text);
      const mergedSkills = Array.from(new Set([...(profile.skills || []), ...meta.skills]));
      setProfile({
        ...profile,
        cv_content: text,
        name: profile.name || meta.name || "",
        email: profile.email || meta.email || "",
        phone: profile.phone || meta.phone || "",
        summary: profile.summary || meta.summary || "",
        skills: mergedSkills,
      });
      toast({
        title: "CV parsed",
        description: `Extracted ${text.length.toLocaleString()} chars, ${meta.skills.length} skills matched. Review and save.`,
      });
    } catch (err: any) {
      toast({ title: "Parse failed", description: err.message, variant: "destructive" });
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        No profile found. Please check your database setup.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Basic Info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Full Name</Label>
          <Input value={profile.name} onChange={e => update("name", e.target.value)} className="bg-secondary/30" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Email</Label>
          <Input value={profile.email} onChange={e => update("email", e.target.value)} className="bg-secondary/30" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Phone</Label>
          <Input value={profile.phone} onChange={e => update("phone", e.target.value)} className="bg-secondary/30" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Location</Label>
          <Input value={profile.location} onChange={e => update("location", e.target.value)} className="bg-secondary/30" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Professional Title</Label>
          <Input value={profile.title} onChange={e => update("title", e.target.value)} className="bg-secondary/30" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Years of Experience</Label>
          <Input value={profile.years_experience} onChange={e => update("years_experience", e.target.value)} className="bg-secondary/30" />
        </div>
      </div>

      {/* Summary */}
      <div className="space-y-1.5">
        <Label className="text-xs">Professional Summary</Label>
        <Textarea
          value={profile.summary}
          onChange={e => update("summary", e.target.value)}
          className="bg-secondary/30 min-h-[80px]"
          placeholder="Brief professional summary used in AI-generated emails..."
        />
      </div>

      {/* Skills */}
      <div className="space-y-2">
        <Label className="text-xs">Skills (used for job matching)</Label>
        <div className="flex flex-wrap gap-1.5">
          {profile.skills.map(skill => (
            <Badge key={skill} variant="secondary" className="gap-1 text-xs">
              {skill}
              <X className="h-3 w-3 cursor-pointer hover:text-destructive" onClick={() => removeSkill(skill)} />
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newSkill}
            onChange={e => setNewSkill(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addSkill()}
            placeholder="Add a skill..."
            className="bg-secondary/30 text-sm"
          />
          <Button size="sm" variant="outline" onClick={addSkill} className="gap-1">
            <Plus className="h-3 w-3" /> Add
          </Button>
        </div>
      </div>

      {/* CV Content */}
      <div className="space-y-1.5">
        <Label className="text-xs">Full CV Content (optional — paste your full CV text here for AI tailoring)</Label>
        <Textarea
          value={profile.cv_content}
          onChange={e => update("cv_content", e.target.value)}
          className="bg-secondary/30 min-h-[120px] font-mono text-xs"
          placeholder="Paste your full CV text here. The AI pipeline will use this as the base for tailoring CVs to each job..."
        />
      </div>

      {/* Gmail Setup Info */}
      <Card className="bg-accent/5 border-accent/20">
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-accent shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Gmail App Password Setup</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>Go to <span className="font-mono text-accent">myaccount.google.com</span> → Security</li>
                <li>Enable <strong>2-Step Verification</strong> if not already on</li>
                <li>Search for <strong>"App passwords"</strong> in your Google Account settings</li>
                <li>Create a new app password (select "Mail" and your device)</li>
                <li>Copy the 16-character password and add it as a backend secret named <span className="font-mono text-accent">GMAIL_APP_PASSWORD</span></li>
              </ol>
              <p className="text-[10px] mt-1">⚠️ Never use your main Google password. App passwords are separate and can be revoked anytime.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save Profile
      </Button>
    </div>
  );
}
