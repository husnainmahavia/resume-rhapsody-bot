export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      applicant_profile: {
        Row: {
          created_at: string
          cv_content: string | null
          email: string
          id: string
          location: string | null
          name: string
          phone: string | null
          skills: string[] | null
          summary: string | null
          title: string | null
          updated_at: string
          years_experience: string | null
        }
        Insert: {
          created_at?: string
          cv_content?: string | null
          email?: string
          id?: string
          location?: string | null
          name?: string
          phone?: string | null
          skills?: string[] | null
          summary?: string | null
          title?: string | null
          updated_at?: string
          years_experience?: string | null
        }
        Update: {
          created_at?: string
          cv_content?: string | null
          email?: string
          id?: string
          location?: string | null
          name?: string
          phone?: string | null
          skills?: string[] | null
          summary?: string | null
          title?: string | null
          updated_at?: string
          years_experience?: string | null
        }
        Relationships: []
      }
      auto_apply_pipeline_state: {
        Row: {
          finished_at: string | null
          id: number
          last_log: string | null
          location: string | null
          running: boolean
          started_at: string | null
          updated_at: string
        }
        Insert: {
          finished_at?: string | null
          id?: number
          last_log?: string | null
          location?: string | null
          running?: boolean
          started_at?: string | null
          updated_at?: string
        }
        Update: {
          finished_at?: string | null
          id?: number
          last_log?: string | null
          location?: string | null
          running?: boolean
          started_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      domain_blacklist: {
        Row: {
          blacklisted_at: string | null
          bounce_count: number
          created_at: string
          domain: string
          id: string
          is_blacklisted: boolean
          last_bounced_at: string
          reason: string | null
        }
        Insert: {
          blacklisted_at?: string | null
          bounce_count?: number
          created_at?: string
          domain: string
          id?: string
          is_blacklisted?: boolean
          last_bounced_at?: string
          reason?: string | null
        }
        Update: {
          blacklisted_at?: string | null
          bounce_count?: number
          created_at?: string
          domain?: string
          id?: string
          is_blacklisted?: boolean
          last_bounced_at?: string
          reason?: string | null
        }
        Relationships: []
      }
      email_engine_leads: {
        Row: {
          bounced: boolean
          campaign_batch: string | null
          clicked: boolean
          company_name: string
          contact_email: string | null
          created_at: string
          description: string | null
          email_body: string | null
          email_generated: boolean
          email_subject: string | null
          id: string
          industry: string
          opened: boolean
          opportunity: string | null
          queued: boolean
          queued_at: string | null
          region: string
          resend_message_id: string | null
          send_error: string | null
          sent: boolean
          sent_at: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          bounced?: boolean
          campaign_batch?: string | null
          clicked?: boolean
          company_name: string
          contact_email?: string | null
          created_at?: string
          description?: string | null
          email_body?: string | null
          email_generated?: boolean
          email_subject?: string | null
          id?: string
          industry?: string
          opened?: boolean
          opportunity?: string | null
          queued?: boolean
          queued_at?: string | null
          region?: string
          resend_message_id?: string | null
          send_error?: string | null
          sent?: boolean
          sent_at?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          bounced?: boolean
          campaign_batch?: string | null
          clicked?: boolean
          company_name?: string
          contact_email?: string | null
          created_at?: string
          description?: string | null
          email_body?: string | null
          email_generated?: boolean
          email_subject?: string | null
          id?: string
          industry?: string
          opened?: boolean
          opportunity?: string | null
          queued?: boolean
          queued_at?: string | null
          region?: string
          resend_message_id?: string | null
          send_error?: string | null
          sent?: boolean
          sent_at?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      email_review_queue: {
        Row: {
          application_id: string | null
          approved: boolean | null
          approved_at: string | null
          company: string
          created_at: string
          domain_match: boolean | null
          email_body: string | null
          email_subject: string | null
          id: string
          recipient_email: string
          recipient_name: string | null
          rejected_reason: string | null
          scraped_company_id: string | null
          source: string
          updated_at: string
          validation_reason: string | null
          validation_status: string
        }
        Insert: {
          application_id?: string | null
          approved?: boolean | null
          approved_at?: string | null
          company: string
          created_at?: string
          domain_match?: boolean | null
          email_body?: string | null
          email_subject?: string | null
          id?: string
          recipient_email: string
          recipient_name?: string | null
          rejected_reason?: string | null
          scraped_company_id?: string | null
          source?: string
          updated_at?: string
          validation_reason?: string | null
          validation_status?: string
        }
        Update: {
          application_id?: string | null
          approved?: boolean | null
          approved_at?: string | null
          company?: string
          created_at?: string
          domain_match?: boolean | null
          email_body?: string | null
          email_subject?: string | null
          id?: string
          recipient_email?: string
          recipient_name?: string | null
          rejected_reason?: string | null
          scraped_company_id?: string | null
          source?: string
          updated_at?: string
          validation_reason?: string | null
          validation_status?: string
        }
        Relationships: []
      }
      email_tracking: {
        Row: {
          application_id: string
          bounce_reason: string | null
          bounced: boolean | null
          created_at: string
          follow_up_count: number | null
          follow_up_sent_at: string | null
          id: string
          open_count: number | null
          opened_at: string | null
          replied_at: string | null
          reply_snippet: string | null
          tracking_pixel_id: string
        }
        Insert: {
          application_id: string
          bounce_reason?: string | null
          bounced?: boolean | null
          created_at?: string
          follow_up_count?: number | null
          follow_up_sent_at?: string | null
          id?: string
          open_count?: number | null
          opened_at?: string | null
          replied_at?: string | null
          reply_snippet?: string | null
          tracking_pixel_id?: string
        }
        Update: {
          application_id?: string
          bounce_reason?: string | null
          bounced?: boolean | null
          created_at?: string
          follow_up_count?: number | null
          follow_up_sent_at?: string | null
          id?: string
          open_count?: number | null
          opened_at?: string | null
          replied_at?: string | null
          reply_snippet?: string | null
          tracking_pixel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_tracking_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "job_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      job_applications: {
        Row: {
          applied_at: string | null
          approved_at: string | null
          ats_missing: string[] | null
          ats_present: string[] | null
          careers_page_url: string | null
          company: string
          cover_letter: string | null
          created_at: string
          cv_profile: string | null
          email_body: string | null
          email_subject: string | null
          follow_up_scheduled_at: string | null
          follow_up_sent: boolean | null
          hiring_manager_email: string | null
          hiring_manager_name: string | null
          id: string
          job_description: string | null
          job_posted_at: string | null
          job_title: string
          job_url: string | null
          location: string | null
          match_breakdown: Json | null
          match_score: number | null
          notes: string | null
          pending_review: boolean
          rejected_at: string | null
          rejected_reason: string | null
          salary_range: string | null
          source: string | null
          sponsorship_available: boolean | null
          status: string
          tailored_cv: string | null
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          approved_at?: string | null
          ats_missing?: string[] | null
          ats_present?: string[] | null
          careers_page_url?: string | null
          company: string
          cover_letter?: string | null
          created_at?: string
          cv_profile?: string | null
          email_body?: string | null
          email_subject?: string | null
          follow_up_scheduled_at?: string | null
          follow_up_sent?: boolean | null
          hiring_manager_email?: string | null
          hiring_manager_name?: string | null
          id?: string
          job_description?: string | null
          job_posted_at?: string | null
          job_title: string
          job_url?: string | null
          location?: string | null
          match_breakdown?: Json | null
          match_score?: number | null
          notes?: string | null
          pending_review?: boolean
          rejected_at?: string | null
          rejected_reason?: string | null
          salary_range?: string | null
          source?: string | null
          sponsorship_available?: boolean | null
          status?: string
          tailored_cv?: string | null
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          approved_at?: string | null
          ats_missing?: string[] | null
          ats_present?: string[] | null
          careers_page_url?: string | null
          company?: string
          cover_letter?: string | null
          created_at?: string
          cv_profile?: string | null
          email_body?: string | null
          email_subject?: string | null
          follow_up_scheduled_at?: string | null
          follow_up_sent?: boolean | null
          hiring_manager_email?: string | null
          hiring_manager_name?: string | null
          id?: string
          job_description?: string | null
          job_posted_at?: string | null
          job_title?: string
          job_url?: string | null
          location?: string | null
          match_breakdown?: Json | null
          match_score?: number | null
          notes?: string | null
          pending_review?: boolean
          rejected_at?: string | null
          rejected_reason?: string | null
          salary_range?: string | null
          source?: string | null
          sponsorship_available?: boolean | null
          status?: string
          tailored_cv?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      linkedin_outreach: {
        Row: {
          company: string
          connection_message: string | null
          created_at: string
          hiring_manager_linkedin: string | null
          hiring_manager_name: string | null
          id: string
          inmail_message: string | null
          job_description: string | null
          job_title: string
          job_url: string | null
          location: string | null
          message_sent: boolean | null
          message_sent_at: string | null
          post_comment: string | null
          response_received: boolean | null
          response_snippet: string | null
          salary_range: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company: string
          connection_message?: string | null
          created_at?: string
          hiring_manager_linkedin?: string | null
          hiring_manager_name?: string | null
          id?: string
          inmail_message?: string | null
          job_description?: string | null
          job_title: string
          job_url?: string | null
          location?: string | null
          message_sent?: boolean | null
          message_sent_at?: string | null
          post_comment?: string | null
          response_received?: boolean | null
          response_snippet?: string | null
          salary_range?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company?: string
          connection_message?: string | null
          created_at?: string
          hiring_manager_linkedin?: string | null
          hiring_manager_name?: string | null
          id?: string
          inmail_message?: string | null
          job_description?: string | null
          job_title?: string
          job_url?: string | null
          location?: string | null
          message_sent?: boolean | null
          message_sent_at?: string | null
          post_comment?: string | null
          response_received?: boolean | null
          response_snippet?: string | null
          salary_range?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      scraped_companies: {
        Row: {
          category: string
          company_name: string
          created_at: string
          description: string | null
          email: string
          email_opened: boolean | null
          email_replied: boolean | null
          email_sent: boolean | null
          email_sent_at: string | null
          id: string
          location: string | null
          reply_snippet: string | null
          source: string | null
          status: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          category?: string
          company_name: string
          created_at?: string
          description?: string | null
          email: string
          email_opened?: boolean | null
          email_replied?: boolean | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          id?: string
          location?: string | null
          reply_snippet?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          category?: string
          company_name?: string
          created_at?: string
          description?: string | null
          email?: string
          email_opened?: boolean | null
          email_replied?: boolean | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          id?: string
          location?: string | null
          reply_snippet?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      sent_emails: {
        Row: {
          application_id: string | null
          created_at: string
          id: string
          lead_id: string | null
          message_id: string | null
          recipient_email: string
          sender: string
          sent_at: string
          subject: string | null
        }
        Insert: {
          application_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          message_id?: string | null
          recipient_email: string
          sender?: string
          sent_at?: string
          subject?: string | null
        }
        Update: {
          application_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          message_id?: string | null
          recipient_email?: string
          sender?: string
          sent_at?: string
          subject?: string | null
        }
        Relationships: []
      }
      services_outreach_leads: {
        Row: {
          batch_id: string | null
          business_name: string
          contact_email: string | null
          created_at: string
          email_body: string | null
          email_generated: boolean
          email_subject: string | null
          id: string
          industry: string | null
          location: string | null
          message_id: string | null
          opportunity: string | null
          phone: string | null
          price_gbp: number | null
          send_error: string | null
          sent: boolean
          sent_at: string | null
          service_category: string
          updated_at: string
          website: string | null
          website_status: string | null
        }
        Insert: {
          batch_id?: string | null
          business_name: string
          contact_email?: string | null
          created_at?: string
          email_body?: string | null
          email_generated?: boolean
          email_subject?: string | null
          id?: string
          industry?: string | null
          location?: string | null
          message_id?: string | null
          opportunity?: string | null
          phone?: string | null
          price_gbp?: number | null
          send_error?: string | null
          sent?: boolean
          sent_at?: string | null
          service_category: string
          updated_at?: string
          website?: string | null
          website_status?: string | null
        }
        Update: {
          batch_id?: string | null
          business_name?: string
          contact_email?: string | null
          created_at?: string
          email_body?: string | null
          email_generated?: boolean
          email_subject?: string | null
          id?: string
          industry?: string | null
          location?: string | null
          message_id?: string | null
          opportunity?: string | null
          phone?: string | null
          price_gbp?: number | null
          send_error?: string | null
          sent?: boolean
          sent_at?: string | null
          service_category?: string
          updated_at?: string
          website?: string | null
          website_status?: string | null
        }
        Relationships: []
      }
      services_outreach_state: {
        Row: {
          discovered: number
          emails_sent: number
          errors: number
          finished_at: string | null
          id: number
          iteration: number
          last_log: string | null
          running: boolean
          started_at: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          discovered?: number
          emails_sent?: number
          errors?: number
          finished_at?: string | null
          id?: number
          iteration?: number
          last_log?: string | null
          running?: boolean
          started_at?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          discovered?: number
          emails_sent?: number
          errors?: number
          finished_at?: string | null
          id?: number
          iteration?: number
          last_log?: string | null
          running?: boolean
          started_at?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
