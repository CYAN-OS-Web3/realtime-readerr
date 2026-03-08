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
      api_keys: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          key_hash: string
          label: string | null
          plan: string | null
          revoked_at: string | null
          user_id: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          key_hash: string
          label?: string | null
          plan?: string | null
          revoked_at?: string | null
          user_id?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          key_hash?: string
          label?: string | null
          plan?: string | null
          revoked_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          device_id: string
          updated_at: string
          user_id: string
          voice_id: string | null
        }
        Insert: {
          device_id: string
          updated_at?: string
          user_id: string
          voice_id?: string | null
        }
        Update: {
          device_id?: string
          updated_at?: string
          user_id?: string
          voice_id?: string | null
        }
        Relationships: []
      }
      eleven_credits: {
        Row: {
          month: string
          updated_at: string
          used: number
          user_id: string
        }
        Insert: {
          month: string
          updated_at?: string
          used?: number
          user_id: string
        }
        Update: {
          month?: string
          updated_at?: string
          used?: number
          user_id?: string
        }
        Relationships: []
      }
      marketplace_identities: {
        Row: {
          created_at: string | null
          id: string
          plan: string | null
          provider: string
          provider_key_hash: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          plan?: string | null
          provider: string
          provider_key_hash: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          plan?: string | null
          provider?: string
          provider_key_hash?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_identities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nowpayments_ipn_logs: {
        Row: {
          id: number
          order_id: string | null
          payment_id: string | null
          payment_status: string | null
          raw: Json
          received_at: string
          sig: string | null
        }
        Insert: {
          id?: number
          order_id?: string | null
          payment_id?: string | null
          payment_status?: string | null
          raw: Json
          received_at?: string
          sig?: string | null
        }
        Update: {
          id?: number
          order_id?: string | null
          payment_id?: string | null
          payment_status?: string | null
          raw?: Json
          received_at?: string
          sig?: string | null
        }
        Relationships: []
      }
      ocean_consumers: {
        Row: {
          consumer_hash: string
          created_at: string
          id: string
        }
        Insert: {
          consumer_hash: string
          created_at?: string
          id?: string
        }
        Update: {
          consumer_hash?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      ocean_quotas: {
        Row: {
          consumer_id: string
          month: string
          updated_at: string
          used: number
        }
        Insert: {
          consumer_id: string
          month: string
          updated_at?: string
          used?: number
        }
        Update: {
          consumer_id?: string
          month?: string
          updated_at?: string
          used?: number
        }
        Relationships: [
          {
            foreignKeyName: "ocean_quotas_consumer_id_fkey"
            columns: ["consumer_id"]
            isOneToOne: false
            referencedRelation: "ocean_consumers"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount: number | null
          created_at: string | null
          currency: string | null
          external_order_id: string | null
          id: string
          plan_id: string | null
          provider: string
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          currency?: string | null
          external_order_id?: string | null
          id?: string
          plan_id?: string | null
          provider: string
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          currency?: string | null
          external_order_id?: string | null
          id?: string
          plan_id?: string | null
          provider?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          minute: number
          updated_at: string
          used: number
          user_id: string
        }
        Insert: {
          minute: number
          updated_at?: string
          used?: number
          user_id: string
        }
        Update: {
          minute?: number
          updated_at?: string
          used?: number
          user_id?: string
        }
        Relationships: []
      }
      tts_cache: {
        Row: {
          audio: string
          content_type: string | null
          key: string
          provider: string | null
          updated_at: string | null
        }
        Insert: {
          audio: string
          content_type?: string | null
          key: string
          provider?: string | null
          updated_at?: string | null
        }
        Update: {
          audio?: string
          content_type?: string | null
          key?: string
          provider?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      usage_logs: {
        Row: {
          api_key_id: string | null
          bytes: number | null
          chars: number | null
          cost: number | null
          created_at: string | null
          endpoint: string | null
          id: string
          provider: string | null
          tier: string | null
          user_id: string | null
        }
        Insert: {
          api_key_id?: string | null
          bytes?: number | null
          chars?: number | null
          cost?: number | null
          created_at?: string | null
          endpoint?: string | null
          id?: string
          provider?: string | null
          tier?: string | null
          user_id?: string | null
        }
        Update: {
          api_key_id?: string | null
          bytes?: number | null
          chars?: number | null
          cost?: number | null
          created_at?: string | null
          endpoint?: string | null
          id?: string
          provider?: string | null
          tier?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          daily_chars: number | null
          email: string | null
          google_id: string | null
          id: string
          last_reset: string | null
          name: string | null
          paypal_subscription_id: string | null
          plan: string | null
          updated_at: string
          wallet_address: string | null
        }
        Insert: {
          created_at?: string | null
          daily_chars?: number | null
          email?: string | null
          google_id?: string | null
          id?: string
          last_reset?: string | null
          name?: string | null
          paypal_subscription_id?: string | null
          plan?: string | null
          updated_at?: string
          wallet_address?: string | null
        }
        Update: {
          created_at?: string | null
          daily_chars?: number | null
          email?: string | null
          google_id?: string | null
          id?: string
          last_reset?: string | null
          name?: string | null
          paypal_subscription_id?: string | null
          plan?: string | null
          updated_at?: string
          wallet_address?: string | null
        }
        Relationships: []
      }
      voice_changes: {
        Row: {
          amount: number | null
          created_at: string
          device_id: string
          id: number
          order_id: string | null
          provider: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          device_id: string
          id?: number
          order_id?: string | null
          provider?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          device_id?: string
          id?: number
          order_id?: string | null
          provider?: string | null
          status?: string | null
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
