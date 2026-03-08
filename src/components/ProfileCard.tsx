import { motion } from "framer-motion";
import { User, MapPin, Mail, Phone, Code2, Briefcase } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { USER_PROFILE } from "@/lib/user-profile";

export default function ProfileCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-lg p-5 space-y-4"
    >
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
          <User className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="font-bold text-lg">{USER_PROFILE.name}</h2>
          <p className="text-xs text-muted-foreground">{USER_PROFILE.title}</p>
        </div>
      </div>

      <div className="space-y-1.5 text-sm text-secondary-foreground">
        <div className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
          {USER_PROFILE.location}
        </div>
        <div className="flex items-center gap-2">
          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
          {USER_PROFILE.email}
        </div>
        <div className="flex items-center gap-2">
          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
          {USER_PROFILE.phone}
        </div>
      </div>

      {/* CV Versions */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">CV Versions</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {USER_PROFILE.cvVersions.map((v) => (
            <Badge key={v} variant="outline" className="text-xs">
              {v}
            </Badge>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Top Skills</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {USER_PROFILE.skills.slice(0, 12).map((skill) => (
            <Badge key={skill} variant="secondary" className="text-xs">
              {skill}
            </Badge>
          ))}
          <Badge variant="outline" className="text-xs">
            +{USER_PROFILE.skills.length - 12} more
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
        <div className="text-center">
          <p className="text-2xl font-bold font-mono text-primary">{USER_PROFILE.projects}+</p>
          <p className="text-xs text-muted-foreground">Projects</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold font-mono text-primary">{USER_PROFILE.experience}</p>
          <p className="text-xs text-muted-foreground">Experience</p>
        </div>
      </div>
    </motion.div>
  );
}
