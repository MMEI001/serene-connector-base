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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_suggestions: {
        Row: {
          content: string | null
          created_at: string
          id: string
          proposed_date: string | null
          proposed_time: string | null
          status: Database["public"]["Enums"]["suggestion_status"]
          suggestion_type: string
          target_item_id: string | null
          target_item_type: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          proposed_date?: string | null
          proposed_time?: string | null
          status?: Database["public"]["Enums"]["suggestion_status"]
          suggestion_type: string
          target_item_id?: string | null
          target_item_type?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          proposed_date?: string | null
          proposed_time?: string | null
          status?: Database["public"]["Enums"]["suggestion_status"]
          suggestion_type?: string
          target_item_id?: string | null
          target_item_type?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          created_at: string
          date: string
          description: string | null
          end_time: string | null
          id: string
          source: Database["public"]["Enums"]["item_source"]
          start_time: string | null
          status: Database["public"]["Enums"]["appointment_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          description?: string | null
          end_time?: string | null
          id?: string
          source?: Database["public"]["Enums"]["item_source"]
          start_time?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          description?: string | null
          end_time?: string | null
          id?: string
          source?: Database["public"]["Enums"]["item_source"]
          start_time?: string | null
          status?: Database["public"]["Enums"]["appointment_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_connections: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string | null
          id: string
          provider: string
          refresh_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at?: string | null
          id?: string
          provider?: string
          refresh_token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          provider?: string
          refresh_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_preferences: {
        Row: {
          calendar_id: string
          created_at: string
          enabled: boolean
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          calendar_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          calendar_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ics_calendars: {
        Row: {
          color: string | null
          created_at: string
          id: string
          last_error: string | null
          last_synced_at: string | null
          name: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          name: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          name?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      ics_events: {
        Row: {
          calendar_id: string
          created_at: string
          description: string | null
          end_time: string | null
          id: string
          is_all_day: boolean
          location: string | null
          start_time: string
          summary: string
          uid: string
          updated_at: string
        }
        Insert: {
          calendar_id: string
          created_at?: string
          description?: string | null
          end_time?: string | null
          id?: string
          is_all_day?: boolean
          location?: string | null
          start_time: string
          summary?: string
          uid: string
          updated_at?: string
        }
        Update: {
          calendar_id?: string
          created_at?: string
          description?: string | null
          end_time?: string | null
          id?: string
          is_all_day?: boolean
          location?: string | null
          start_time?: string
          summary?: string
          uid?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ics_events_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "ics_calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      let_go_items: {
        Row: {
          action_intent: string | null
          content: string
          created_at: string
          id: string
          linked_item_id: string | null
          linked_item_type: string | null
          status: Database["public"]["Enums"]["let_go_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          action_intent?: string | null
          content: string
          created_at?: string
          id?: string
          linked_item_id?: string | null
          linked_item_type?: string | null
          status?: Database["public"]["Enums"]["let_go_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          action_intent?: string | null
          content?: string
          created_at?: string
          id?: string
          linked_item_id?: string | null
          linked_item_type?: string | null
          status?: Database["public"]["Enums"]["let_go_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          content: string
          created_at: string
          id: string
          status: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          status?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          created_at: string
          description: string | null
          id: string
          related_appointment_id: string | null
          remind_at: string | null
          source: Database["public"]["Enums"]["item_source"]
          status: Database["public"]["Enums"]["reminder_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          related_appointment_id?: string | null
          remind_at?: string | null
          source?: Database["public"]["Enums"]["item_source"]
          status?: Database["public"]["Enums"]["reminder_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          related_appointment_id?: string | null
          remind_at?: string | null
          source?: Database["public"]["Enums"]["item_source"]
          status?: Database["public"]["Enums"]["reminder_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_related_appointment_id_fkey"
            columns: ["related_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      user_behavior_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          item_id: string | null
          item_type: string | null
          metadata: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          item_id?: string | null
          item_type?: string | null
          metadata?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          item_id?: string | null
          item_type?: string | null
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string
          hard_moment_of_day: string[] | null
          id: string
          main_difficulty: string[] | null
          overstimulation_level: string | null
          planning_style: string | null
          preferred_help_area: string[] | null
          primary_goal: string[] | null
          reminder_style: string | null
          ritual_enabled: boolean
          ritual_time: string
          suggestion_count_preference: string | null
          support_style: string | null
          updated_at: string
          user_id: string
          voice_enabled: boolean | null
          voice_id: string | null
        }
        Insert: {
          created_at?: string
          hard_moment_of_day?: string[] | null
          id?: string
          main_difficulty?: string[] | null
          overstimulation_level?: string | null
          planning_style?: string | null
          preferred_help_area?: string[] | null
          primary_goal?: string[] | null
          reminder_style?: string | null
          ritual_enabled?: boolean
          ritual_time?: string
          suggestion_count_preference?: string | null
          support_style?: string | null
          updated_at?: string
          user_id: string
          voice_enabled?: boolean | null
          voice_id?: string | null
        }
        Update: {
          created_at?: string
          hard_moment_of_day?: string[] | null
          id?: string
          main_difficulty?: string[] | null
          overstimulation_level?: string | null
          planning_style?: string | null
          preferred_help_area?: string[] | null
          primary_goal?: string[] | null
          reminder_style?: string | null
          ritual_enabled?: boolean
          ritual_time?: string
          suggestion_count_preference?: string | null
          support_style?: string | null
          updated_at?: string
          user_id?: string
          voice_enabled?: boolean | null
          voice_id?: string | null
        }
        Relationships: []
      }
      voice_actions: {
        Row: {
          confirmation_text: string | null
          created_at: string
          error: string | null
          expires_at: string | null
          id: string
          intent: Database["public"]["Enums"]["voice_intent"]
          payload: Json
          result_id: string | null
          result_table: string | null
          status: Database["public"]["Enums"]["voice_action_status"]
          transcription_id: string | null
          user_id: string
        }
        Insert: {
          confirmation_text?: string | null
          created_at?: string
          error?: string | null
          expires_at?: string | null
          id?: string
          intent: Database["public"]["Enums"]["voice_intent"]
          payload?: Json
          result_id?: string | null
          result_table?: string | null
          status?: Database["public"]["Enums"]["voice_action_status"]
          transcription_id?: string | null
          user_id: string
        }
        Update: {
          confirmation_text?: string | null
          created_at?: string
          error?: string | null
          expires_at?: string | null
          id?: string
          intent?: Database["public"]["Enums"]["voice_intent"]
          payload?: Json
          result_id?: string | null
          result_table?: string | null
          status?: Database["public"]["Enums"]["voice_action_status"]
          transcription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_actions_transcription_id_fkey"
            columns: ["transcription_id"]
            isOneToOne: false
            referencedRelation: "voice_transcriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_errors: {
        Row: {
          created_at: string
          error_code: string | null
          http_status: number | null
          id: string
          provider: string
          stage: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          http_status?: number | null
          id?: string
          provider: string
          stage?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_code?: string | null
          http_status?: number | null
          id?: string
          provider?: string
          stage?: string
          user_id?: string
        }
        Relationships: []
      }
      voice_intents: {
        Row: {
          ambiguous: boolean
          clarification_question: string | null
          completion_tokens: number | null
          confidence: number | null
          cost_usd: number | null
          created_at: string
          id: string
          intent: Database["public"]["Enums"]["voice_intent"]
          model: string
          payload: Json
          prompt_tokens: number | null
          total_tokens: number | null
          transcription_id: string | null
          user_id: string
        }
        Insert: {
          ambiguous?: boolean
          clarification_question?: string | null
          completion_tokens?: number | null
          confidence?: number | null
          cost_usd?: number | null
          created_at?: string
          id?: string
          intent: Database["public"]["Enums"]["voice_intent"]
          model: string
          payload?: Json
          prompt_tokens?: number | null
          total_tokens?: number | null
          transcription_id?: string | null
          user_id: string
        }
        Update: {
          ambiguous?: boolean
          clarification_question?: string | null
          completion_tokens?: number | null
          confidence?: number | null
          cost_usd?: number | null
          created_at?: string
          id?: string
          intent?: Database["public"]["Enums"]["voice_intent"]
          model?: string
          payload?: Json
          prompt_tokens?: number | null
          total_tokens?: number | null
          transcription_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      voice_transcriptions: {
        Row: {
          bytes: number | null
          created_at: string
          duration_seconds: number | null
          estimated_cost_usd: number | null
          id: string
          model: string
          user_id: string
        }
        Insert: {
          bytes?: number | null
          created_at?: string
          duration_seconds?: number | null
          estimated_cost_usd?: number | null
          id?: string
          model?: string
          user_id: string
        }
        Update: {
          bytes?: number | null
          created_at?: string
          duration_seconds?: number | null
          estimated_cost_usd?: number | null
          id?: string
          model?: string
          user_id?: string
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
      appointment_status: "scheduled" | "completed" | "cancelled"
      item_source:
        | "manual"
        | "ai_suggested"
        | "confirmed_from_ai"
        | "imported"
        | "onboarding"
        | "system"
      let_go_status: "active" | "archived" | "processed"
      reminder_status: "active" | "done" | "snoozed" | "deleted"
      suggestion_status: "pending" | "accepted" | "dismissed" | "deleted"
      voice_action_status:
        | "completed"
        | "needs_confirmation"
        | "failed"
        | "skipped"
      voice_intent:
        | "release"
        | "reminder"
        | "note"
        | "event"
        | "query"
        | "checkin"
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
      appointment_status: ["scheduled", "completed", "cancelled"],
      item_source: [
        "manual",
        "ai_suggested",
        "confirmed_from_ai",
        "imported",
        "onboarding",
        "system",
      ],
      let_go_status: ["active", "archived", "processed"],
      reminder_status: ["active", "done", "snoozed", "deleted"],
      suggestion_status: ["pending", "accepted", "dismissed", "deleted"],
      voice_action_status: [
        "completed",
        "needs_confirmation",
        "failed",
        "skipped",
      ],
      voice_intent: [
        "release",
        "reminder",
        "note",
        "event",
        "query",
        "checkin",
      ],
    },
  },
} as const
