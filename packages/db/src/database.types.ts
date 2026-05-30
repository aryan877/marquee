export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      _prisma_migrations: {
        Row: {
          applied_steps_count: number
          checksum: string
          finished_at: string | null
          id: string
          logs: string | null
          migration_name: string
          rolled_back_at: string | null
          started_at: string
        }
        Insert: {
          applied_steps_count?: number
          checksum: string
          finished_at?: string | null
          id: string
          logs?: string | null
          migration_name: string
          rolled_back_at?: string | null
          started_at?: string
        }
        Update: {
          applied_steps_count?: number
          checksum?: string
          finished_at?: string | null
          id?: string
          logs?: string | null
          migration_name?: string
          rolled_back_at?: string | null
          started_at?: string
        }
        Relationships: []
      }
      agent_usage_events: {
        Row: {
          created_at: string
          estimated_cost_usd: number
          id: number
          input_tokens: number
          job_id: string | null
          metadata: Json
          model: string
          output_tokens: number
          provider: string
          purpose: string
        }
        Insert: {
          created_at?: string
          estimated_cost_usd?: number
          id?: number
          input_tokens?: number
          job_id?: string | null
          metadata?: Json
          model: string
          output_tokens?: number
          provider: string
          purpose: string
        }
        Update: {
          created_at?: string
          estimated_cost_usd?: number
          id?: number
          input_tokens?: number
          job_id?: string | null
          metadata?: Json
          model?: string
          output_tokens?: number
          provider?: string
          purpose?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_usage_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "content_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          description: string | null
          fonts: Json
          guidelines: Json
          handle: string | null
          id: string
          industry: string | null
          is_active: boolean
          logo_url: string | null
          name: string
          palette: Json
          target_audience: string | null
          updated_at: string
          user_id: string
          voice: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          fonts?: Json
          guidelines?: Json
          handle?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean
          logo_url?: string | null
          name: string
          palette?: Json
          target_audience?: string | null
          updated_at?: string
          user_id: string
          voice?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          fonts?: Json
          guidelines?: Json
          handle?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean
          logo_url?: string | null
          name?: string
          palette?: Json
          target_audience?: string | null
          updated_at?: string
          user_id?: string
          voice?: Json
        }
        Relationships: [
          {
            foreignKeyName: "brands_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          active: boolean
          auto_publish: boolean
          autopilot: boolean
          brand_id: string
          content_type: Database["public"]["Enums"]["ContentType"]
          created_at: string
          cron_expression: string | null
          id: string
          name: string
          next_run_at: string | null
          platforms: Database["public"]["Enums"]["SocialPlatform"][] | null
          topic_pool: string[] | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          auto_publish?: boolean
          autopilot?: boolean
          brand_id: string
          content_type: Database["public"]["Enums"]["ContentType"]
          created_at?: string
          cron_expression?: string | null
          id?: string
          name: string
          next_run_at?: string | null
          platforms?: Database["public"]["Enums"]["SocialPlatform"][] | null
          topic_pool?: string[] | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          auto_publish?: boolean
          autopilot?: boolean
          brand_id?: string
          content_type?: Database["public"]["Enums"]["ContentType"]
          created_at?: string
          cron_expression?: string | null
          id?: string
          name?: string
          next_run_at?: string | null
          platforms?: Database["public"]["Enums"]["SocialPlatform"][] | null
          topic_pool?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      content_job_artifacts: {
        Row: {
          created_at: string
          duration_s: number | null
          height: number | null
          id: string
          iteration: number
          job_id: string
          key: string | null
          kind: string
          metadata: Json
          mime_type: string | null
          role: string
          url: string | null
          width: number | null
        }
        Insert: {
          created_at?: string
          duration_s?: number | null
          height?: number | null
          id?: string
          iteration?: number
          job_id: string
          key?: string | null
          kind: string
          metadata?: Json
          mime_type?: string | null
          role: string
          url?: string | null
          width?: number | null
        }
        Update: {
          created_at?: string
          duration_s?: number | null
          height?: number | null
          id?: string
          iteration?: number
          job_id?: string
          key?: string | null
          kind?: string
          metadata?: Json
          mime_type?: string | null
          role?: string
          url?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_job_artifacts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "content_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      content_jobs: {
        Row: {
          approved_at: string | null
          brand_id: string
          campaign_id: string | null
          caption: string | null
          completed_at: string | null
          content_type: Database["public"]["Enums"]["ContentType"]
          created_at: string
          error_message: string | null
          hashtags: string[] | null
          id: string
          metadata: Json
          output_key: string | null
          output_url: string | null
          platforms: Database["public"]["Enums"]["SocialPlatform"][] | null
          posted_at: string | null
          queue_plan: string
          queue_priority: number
          status: Database["public"]["Enums"]["ContentJobStatus"]
          thumbnail_url: string | null
          topic: string | null
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          brand_id: string
          campaign_id?: string | null
          caption?: string | null
          completed_at?: string | null
          content_type: Database["public"]["Enums"]["ContentType"]
          created_at?: string
          error_message?: string | null
          hashtags?: string[] | null
          id?: string
          metadata?: Json
          output_key?: string | null
          output_url?: string | null
          platforms?: Database["public"]["Enums"]["SocialPlatform"][] | null
          posted_at?: string | null
          queue_plan?: string
          queue_priority?: number
          status?: Database["public"]["Enums"]["ContentJobStatus"]
          thumbnail_url?: string | null
          topic?: string | null
          user_id: string
        }
        Update: {
          approved_at?: string | null
          brand_id?: string
          campaign_id?: string | null
          caption?: string | null
          completed_at?: string | null
          content_type?: Database["public"]["Enums"]["ContentType"]
          created_at?: string
          error_message?: string | null
          hashtags?: string[] | null
          id?: string
          metadata?: Json
          output_key?: string | null
          output_url?: string | null
          platforms?: Database["public"]["Enums"]["SocialPlatform"][] | null
          posted_at?: string | null
          queue_plan?: string
          queue_priority?: number
          status?: Database["public"]["Enums"]["ContentJobStatus"]
          thumbnail_url?: string | null
          topic?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_jobs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      dodo_webhook_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          payload: Json
          processed_at: string | null
          webhook_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          payload: Json
          processed_at?: string | null
          webhook_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          payload?: Json
          processed_at?: string | null
          webhook_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          ban_reason: string | null
          banned_at: string | null
          cancel_at_period_end: boolean
          created_at: string
          dodo_customer_id: string | null
          dodo_subscription_id: string | null
          email: string
          id: string
          period_ends_at: string | null
          plan: string
          posts_used_period: number
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          dodo_customer_id?: string | null
          dodo_subscription_id?: string | null
          email: string
          id: string
          period_ends_at?: string | null
          plan?: string
          posts_used_period?: number
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          dodo_customer_id?: string | null
          dodo_subscription_id?: string | null
          email?: string
          id?: string
          period_ends_at?: string | null
          plan?: string
          posts_used_period?: number
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      progress_events: {
        Row: {
          created_at: string
          id: number
          job_id: string
          message: string
          payload: Json | null
          progress: number | null
          step: string
        }
        Insert: {
          created_at?: string
          id?: number
          job_id: string
          message: string
          payload?: Json | null
          progress?: number | null
          step: string
        }
        Update: {
          created_at?: string
          id?: number
          job_id?: string
          message?: string
          payload?: Json | null
          progress?: number | null
          step?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "content_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          brand_id: string
          created_at: string
          handle: string
          id: string
          is_active: boolean
          last_post_at: string | null
          platform: Database["public"]["Enums"]["SocialPlatform"]
          session_enc: string | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          handle: string
          id?: string
          is_active?: boolean
          last_post_at?: string | null
          platform: Database["public"]["Enums"]["SocialPlatform"]
          session_enc?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          handle?: string
          id?: string
          is_active?: boolean
          last_post_at?: string | null
          platform?: Database["public"]["Enums"]["SocialPlatform"]
          session_enc?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_heartbeat: {
        Row: {
          id: number
          updated_at: string
        }
        Insert: {
          id?: number
          updated_at?: string
        }
        Update: {
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_subscription: {
        Args: {
          p_customer_id: string
          p_period_ends_at: string
          p_subscription_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      archive_content_job: { Args: { p_msg_id: number }; Returns: boolean }
      bump_worker_heartbeat: { Args: never; Returns: undefined }
      cancel_subscription: {
        Args: { p_cancel_at_period_end: boolean; p_subscription_id: string }
        Returns: undefined
      }
      create_brand: {
        Args: {
          p_description?: string
          p_fonts?: Json
          p_guidelines?: Json
          p_handle?: string
          p_industry?: string
          p_logo_url?: string
          p_name: string
          p_palette?: Json
          p_target_audience?: string
          p_user_id: string
          p_voice?: Json
        }
        Returns: string
      }
      create_job_artifact: {
        Args: {
          p_duration_s?: number
          p_height?: number
          p_iteration?: number
          p_job_id: string
          p_key?: string
          p_kind: string
          p_metadata?: Json
          p_mime_type?: string
          p_role: string
          p_url?: string
          p_width?: number
        }
        Returns: string
      }
      emit_progress_event: {
        Args: {
          p_job_id: string
          p_message: string
          p_payload?: Json
          p_progress?: number
          p_step: string
        }
        Returns: number
      }
      expire_subscription: {
        Args: { p_subscription_id: string }
        Returns: undefined
      }
      extend_content_job_vt: {
        Args: { p_msg_id: number; p_visibility_timeout_seconds: number }
        Returns: boolean
      }
      get_agent_daily_spend: { Args: { p_day?: string }; Returns: number }
      get_brand: {
        Args: { p_brand_id: string }
        Returns: {
          created_at: string
          description: string
          fonts: Json
          guidelines: Json
          handle: string
          id: string
          industry: string
          is_active: boolean
          logo_url: string
          name: string
          palette: Json
          target_audience: string
          voice: Json
        }[]
      }
      get_brand_for_job: {
        Args: { p_brand_id: string }
        Returns: {
          description: string
          fonts: Json
          guidelines: Json
          handle: string
          id: string
          industry: string
          logo_url: string
          name: string
          palette: Json
          target_audience: string
          user_id: string
          voice: Json
        }[]
      }
      get_brand_owner: {
        Args: { p_brand_id: string }
        Returns: {
          id: string
          user_id: string
        }[]
      }
      get_brands: {
        Args: { p_cursor?: string; p_limit?: number }
        Returns: {
          created_at: string
          description: string
          fonts: Json
          guidelines: Json
          handle: string
          id: string
          industry: string
          is_active: boolean
          logo_url: string
          name: string
          palette: Json
          target_audience: string
          voice: Json
        }[]
      }
      get_brands_page: {
        Args: {
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_limit?: number
        }
        Returns: {
          created_at: string
          description: string
          fonts: Json
          guidelines: Json
          handle: string
          id: string
          industry: string
          is_active: boolean
          logo_url: string
          name: string
          palette: Json
          target_audience: string
          voice: Json
        }[]
      }
      get_campaigns: {
        Args: { p_limit?: number }
        Returns: {
          active: boolean
          auto_publish: boolean
          autopilot: boolean
          brand_id: string
          content_type: Database["public"]["Enums"]["ContentType"]
          created_at: string
          cron_expression: string
          id: string
          name: string
          next_run_at: string
          platforms: Database["public"]["Enums"]["SocialPlatform"][]
          topic_pool: string[]
        }[]
      }
      get_campaigns_page: {
        Args: {
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_limit?: number
        }
        Returns: {
          active: boolean
          auto_publish: boolean
          autopilot: boolean
          brand_id: string
          brand_name: string
          content_type: Database["public"]["Enums"]["ContentType"]
          created_at: string
          cron_expression: string
          id: string
          name: string
          next_run_at: string
          platforms: Database["public"]["Enums"]["SocialPlatform"][]
          topic_pool: string[]
        }[]
      }
      get_connected_social_accounts: {
        Args: { p_brand_id: string }
        Returns: {
          handle: string
          is_active: boolean
          platform: Database["public"]["Enums"]["SocialPlatform"]
        }[]
      }
      get_connected_social_accounts_for_job: {
        Args: { p_job_id: string }
        Returns: {
          handle: string
          is_active: boolean
          platform: Database["public"]["Enums"]["SocialPlatform"]
        }[]
      }
      get_content_job: {
        Args: { p_job_id: string }
        Returns: {
          approved_at: string
          brand_id: string
          campaign_id: string
          caption: string
          completed_at: string
          content_type: Database["public"]["Enums"]["ContentType"]
          created_at: string
          error_message: string
          hashtags: string[]
          id: string
          metadata: Json
          output_url: string
          platforms: Database["public"]["Enums"]["SocialPlatform"][]
          posted_at: string
          queue_priority: number
          status: Database["public"]["Enums"]["ContentJobStatus"]
          thumbnail_url: string
          topic: string
        }[]
      }
      get_content_job_for_approval: {
        Args: { p_job_id: string }
        Returns: {
          brand_id: string
          caption: string
          id: string
          output_url: string
          platforms: Database["public"]["Enums"]["SocialPlatform"][]
          status: Database["public"]["Enums"]["ContentJobStatus"]
          user_id: string
        }[]
      }
      get_content_job_full: {
        Args: { p_job_id: string }
        Returns: {
          brand_id: string
          campaign_id: string
          content_type: Database["public"]["Enums"]["ContentType"]
          created_at: string
          id: string
          metadata: Json
          platforms: Database["public"]["Enums"]["SocialPlatform"][]
          queue_plan: string
          queue_priority: number
          status: Database["public"]["Enums"]["ContentJobStatus"]
          topic: string
          user_id: string
        }[]
      }
      get_content_jobs: {
        Args: { p_brand_id?: string; p_cursor?: string; p_limit?: number }
        Returns: {
          brand_id: string
          caption: string
          completed_at: string
          content_type: Database["public"]["Enums"]["ContentType"]
          created_at: string
          error_message: string
          hashtags: string[]
          id: string
          output_url: string
          platforms: Database["public"]["Enums"]["SocialPlatform"][]
          posted_at: string
          status: Database["public"]["Enums"]["ContentJobStatus"]
          thumbnail_url: string
          topic: string
        }[]
      }
      get_content_jobs_page: {
        Args: {
          p_brand_id?: string
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_limit?: number
        }
        Returns: {
          approved_at: string
          brand_id: string
          brand_name: string
          caption: string
          completed_at: string
          content_type: Database["public"]["Enums"]["ContentType"]
          created_at: string
          error_message: string
          id: string
          output_url: string
          platforms: Database["public"]["Enums"]["SocialPlatform"][]
          posted_at: string
          status: Database["public"]["Enums"]["ContentJobStatus"]
          thumbnail_url: string
          topic: string
        }[]
      }
      get_job_artifacts: {
        Args: { p_job_id: string }
        Returns: {
          created_at: string
          duration_s: number
          height: number
          id: string
          iteration: number
          job_id: string
          key: string
          kind: string
          metadata: Json
          mime_type: string
          role: string
          url: string
          width: number
        }[]
      }
      get_job_events: {
        Args: { p_job_id: string }
        Returns: {
          created_at: string
          id: number
          message: string
          payload: Json
          progress: number
          step: string
        }[]
      }
      get_profile: {
        Args: never
        Returns: {
          avatar_url: string
          cancel_at_period_end: boolean
          created_at: string
          dodo_subscription_id: string
          email: string
          id: string
          period_ends_at: string
          plan: string
          posts_used_period: number
          username: string
        }[]
      }
      get_profile_for_checkout: {
        Args: { p_user_id: string }
        Returns: {
          dodo_customer_id: string
          username: string
        }[]
      }
      get_profile_for_job_submit: {
        Args: { p_user_id: string }
        Returns: {
          banned_at: string
          plan: string
        }[]
      }
      get_social_session: {
        Args: {
          p_brand_id: string
          p_platform: Database["public"]["Enums"]["SocialPlatform"]
        }
        Returns: {
          handle: string
          id: string
          session: string
        }[]
      }
      mark_content_job_approved: {
        Args: { p_job_id: string }
        Returns: undefined
      }
      mark_webhook_processed: {
        Args: { p_error_message?: string; p_webhook_id: string }
        Returns: undefined
      }
      queue_position: { Args: { p_job_id: string }; Returns: number }
      queue_priority_for_plan: { Args: { p_plan: string }; Returns: number }
      read_next_content_job: {
        Args: { p_visibility_timeout_seconds: number }
        Returns: {
          enqueued_at: string
          headers: Json
          message: Json
          msg_id: number
          read_ct: number
          vt: string
        }[]
      }
      record_agent_usage: {
        Args: {
          p_estimated_cost_usd?: number
          p_input_tokens?: number
          p_job_id: string
          p_metadata?: Json
          p_model: string
          p_output_tokens?: number
          p_provider: string
          p_purpose: string
        }
        Returns: number
      }
      record_webhook_event: {
        Args: { p_event_type: string; p_payload: Json; p_webhook_id: string }
        Returns: boolean
      }
      refund_content_job: {
        Args: { p_error_message?: string; p_job_id: string }
        Returns: undefined
      }
      renew_subscription: {
        Args: { p_period_ends_at: string; p_subscription_id: string }
        Returns: undefined
      }
      set_job_caption: {
        Args: { p_caption: string; p_hashtags: string[]; p_job_id: string }
        Returns: undefined
      }
      set_job_output: {
        Args: {
          p_job_id: string
          p_output_key: string
          p_output_url: string
          p_thumbnail_url?: string
        }
        Returns: undefined
      }
      submit_content_job: {
        Args: {
          p_brand_id: string
          p_campaign_id?: string
          p_content_type: Database["public"]["Enums"]["ContentType"]
          p_platforms: Database["public"]["Enums"]["SocialPlatform"][]
          p_post_budget: number
          p_topic?: string
          p_user_id: string
        }
        Returns: string
      }
      sweep_autopilot: { Args: never; Returns: number }
      sweep_orphan_jobs: { Args: { p_stall_window?: string }; Returns: number }
      update_brand: {
        Args: {
          p_brand_id: string
          p_description?: string
          p_fonts?: Json
          p_guidelines?: Json
          p_handle?: string
          p_industry?: string
          p_is_active?: boolean
          p_logo_url?: string
          p_name: string
          p_palette?: Json
          p_target_audience?: string
          p_voice?: Json
        }
        Returns: {
          created_at: string
          description: string
          fonts: Json
          guidelines: Json
          handle: string
          id: string
          industry: string
          is_active: boolean
          logo_url: string
          name: string
          palette: Json
          target_audience: string
          voice: Json
        }[]
      }
      update_content_job_status: {
        Args: {
          p_error_message?: string
          p_job_id: string
          p_status: Database["public"]["Enums"]["ContentJobStatus"]
        }
        Returns: undefined
      }
      upsert_social_account: {
        Args: {
          p_brand_id: string
          p_handle: string
          p_platform: Database["public"]["Enums"]["SocialPlatform"]
          p_session_enc?: string
        }
        Returns: string
      }
    }
    Enums: {
      ContentJobStatus:
        | "PENDING"
        | "GENERATING"
        | "RENDERING"
        | "REVIEW"
        | "POSTING"
        | "POSTED"
        | "FAILED"
        | "CANCELLED"
      ContentType: "POSTER" | "VIDEO" | "CAROUSEL" | "REEL"
      SocialPlatform:
        | "INSTAGRAM"
        | "TIKTOK"
        | "TWITTER"
        | "LINKEDIN"
        | "FACEBOOK"
        | "YOUTUBE"
        | "BLUESKY"
        | "THREADS"
        | "PINTEREST"
        | "GOOGLE_BUSINESS"
        | "MASTODON"
        | "DISCORD"
        | "TELEGRAM"
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
    Enums: {
      ContentJobStatus: [
        "PENDING",
        "GENERATING",
        "RENDERING",
        "REVIEW",
        "POSTING",
        "POSTED",
        "FAILED",
        "CANCELLED",
      ],
      ContentType: ["POSTER", "VIDEO", "CAROUSEL", "REEL"],
      SocialPlatform: [
        "INSTAGRAM",
        "TIKTOK",
        "TWITTER",
        "LINKEDIN",
        "FACEBOOK",
        "YOUTUBE",
        "BLUESKY",
        "THREADS",
        "PINTEREST",
        "GOOGLE_BUSINESS",
        "MASTODON",
        "DISCORD",
        "TELEGRAM",
      ],
    },
  },
} as const
