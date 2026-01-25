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
      organization_wallets: {
        Row: {
          created_at: string
          id: string
          last_purchase_at: string | null
          organization_id: string
          tokens_allocated: number
          tokens_consumed: number
          tokens_expire_at: string | null
          tokens_purchased: number
          total_tokens: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_purchase_at?: string | null
          organization_id: string
          tokens_allocated?: number
          tokens_consumed?: number
          tokens_expire_at?: string | null
          tokens_purchased?: number
          total_tokens?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_purchase_at?: string | null
          organization_id?: string
          tokens_allocated?: number
          tokens_consumed?: number
          tokens_expire_at?: string | null
          tokens_purchased?: number
          total_tokens?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_wallets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          organization_id: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          organization_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          organization_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      token_action_costs: {
        Row: {
          action_type: Database["public"]["Enums"]["token_action_type"]
          admin_only: boolean | null
          created_at: string
          id: string
          is_enabled: boolean | null
          organization_id: string | null
          token_cost: number
        }
        Insert: {
          action_type: Database["public"]["Enums"]["token_action_type"]
          admin_only?: boolean | null
          created_at?: string
          id?: string
          is_enabled?: boolean | null
          organization_id?: string | null
          token_cost: number
        }
        Update: {
          action_type?: Database["public"]["Enums"]["token_action_type"]
          admin_only?: boolean | null
          created_at?: string
          id?: string
          is_enabled?: boolean | null
          organization_id?: string | null
          token_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "token_action_costs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      token_transactions: {
        Row: {
          action_type: Database["public"]["Enums"]["token_action_type"] | null
          amount: number
          balance_after: number | null
          balance_before: number | null
          created_at: string
          id: string
          metadata: Json | null
          organization_id: string
          transaction_type: Database["public"]["Enums"]["token_transaction_type"]
          user_id: string | null
        }
        Insert: {
          action_type?: Database["public"]["Enums"]["token_action_type"] | null
          amount: number
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string
          id?: string
          metadata?: Json | null
          organization_id: string
          transaction_type: Database["public"]["Enums"]["token_transaction_type"]
          user_id?: string | null
        }
        Update: {
          action_type?: Database["public"]["Enums"]["token_action_type"] | null
          amount?: number
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string
          id?: string
          metadata?: Json | null
          organization_id?: string
          transaction_type?: Database["public"]["Enums"]["token_transaction_type"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "token_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_token_allocations: {
        Row: {
          allocated_by: string | null
          created_at: string
          current_balance: number
          id: string
          last_reset_at: string | null
          monthly_quota: number
          organization_id: string
          quota_reset_day: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allocated_by?: string | null
          created_at?: string
          current_balance?: number
          id?: string
          last_reset_at?: string | null
          monthly_quota?: number
          organization_id: string
          quota_reset_day?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allocated_by?: string | null
          created_at?: string
          current_balance?: number
          id?: string
          last_reset_at?: string | null
          monthly_quota?: number
          organization_id?: string
          quota_reset_day?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_token_allocations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_token_balance: {
        Args: { _org_id: string; _required: number; _user_id: string }
        Returns: boolean
      }
      get_user_org_id: { Args: { _user_id: string }; Returns: string }
      get_user_role: {
        Args: { _org_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_admin: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "moderator" | "user"
      token_action_type:
        | "message_text"
        | "message_media"
        | "ai_summary"
        | "ai_smart_reply"
        | "ai_moderation"
        | "ai_analytics"
        | "broadcast"
        | "voice_note"
        | "file_share"
      token_transaction_type:
        | "purchase"
        | "allocation"
        | "revocation"
        | "consumption"
        | "expiration"
        | "monthly_reset"
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
      app_role: ["super_admin", "admin", "moderator", "user"],
      token_action_type: [
        "message_text",
        "message_media",
        "ai_summary",
        "ai_smart_reply",
        "ai_moderation",
        "ai_analytics",
        "broadcast",
        "voice_note",
        "file_share",
      ],
      token_transaction_type: [
        "purchase",
        "allocation",
        "revocation",
        "consumption",
        "expiration",
        "monthly_reset",
      ],
    },
  },
} as const
