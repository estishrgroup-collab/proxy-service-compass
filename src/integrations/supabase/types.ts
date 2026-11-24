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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      proxy_orders: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          failure_reason: string | null
          hours: number | null
          id: string
          isp: string | null
          profit_cents: number | null
          provider: string
          real_ip: string | null
          region: string | null
          retail_cents: number
          socks_host: string | null
          socks_password: string | null
          socks_port: number | null
          socks_username: string | null
          source_update_id: number | null
          status: string
          supplier_order_id: string | null
          supplier_proxy_id: string
          telegram_chat_id: number
          telegram_user_id: number
          updated_at: string
          wholesale_cents: number
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          failure_reason?: string | null
          hours?: number | null
          id?: string
          isp?: string | null
          profit_cents?: number | null
          provider: string
          real_ip?: string | null
          region?: string | null
          retail_cents: number
          socks_host?: string | null
          socks_password?: string | null
          socks_port?: number | null
          socks_username?: string | null
          source_update_id?: number | null
          status?: string
          supplier_order_id?: string | null
          supplier_proxy_id: string
          telegram_chat_id: number
          telegram_user_id: number
          updated_at?: string
          wholesale_cents: number
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          failure_reason?: string | null
          hours?: number | null
          id?: string
          isp?: string | null
          profit_cents?: number | null
          provider?: string
          real_ip?: string | null
          region?: string | null
          retail_cents?: number
          socks_host?: string | null
          socks_password?: string | null
          socks_port?: number | null
          socks_username?: string | null
          source_update_id?: number | null
          status?: string
          supplier_order_id?: string | null
          supplier_proxy_id?: string
          telegram_chat_id?: number
          telegram_user_id?: number
          updated_at?: string
          wholesale_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "proxy_orders_telegram_user_id_fkey"
            columns: ["telegram_user_id"]
            isOneToOne: false
            referencedRelation: "telegram_customers"
            referencedColumns: ["telegram_user_id"]
          },
        ]
      }
      telegram_bot_sessions: {
        Row: {
          country_filter: string | null
          page: number
          provider: string
          selected_proxy_id: string | null
          selected_proxy_json: Json | null
          state: string
          telegram_chat_id: number
          telegram_user_id: number
          updated_at: string
        }
        Insert: {
          country_filter?: string | null
          page?: number
          provider: string
          selected_proxy_id?: string | null
          selected_proxy_json?: Json | null
          state?: string
          telegram_chat_id: number
          telegram_user_id: number
          updated_at?: string
        }
        Update: {
          country_filter?: string | null
          page?: number
          provider?: string
          selected_proxy_id?: string | null
          selected_proxy_json?: Json | null
          state?: string
          telegram_chat_id?: number
          telegram_user_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      telegram_customers: {
        Row: {
          balance_cents: number
          created_at: string
          first_name: string | null
          telegram_chat_id: number
          telegram_user_id: number
          updated_at: string
          username: string | null
        }
        Insert: {
          balance_cents?: number
          created_at?: string
          first_name?: string | null
          telegram_chat_id: number
          telegram_user_id: number
          updated_at?: string
          username?: string | null
        }
        Update: {
          balance_cents?: number
          created_at?: string
          first_name?: string | null
          telegram_chat_id?: number
          telegram_user_id?: number
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      telegram_order_requests: {
        Row: {
          created_at: string
          id: string
          provider: string
          request_details: string
          source_update_id: number
          status: string
          telegram_chat_id: number
          telegram_user_id: number
        }
        Insert: {
          created_at?: string
          id?: string
          provider: string
          request_details: string
          source_update_id: number
          status?: string
          telegram_chat_id: number
          telegram_user_id: number
        }
        Update: {
          created_at?: string
          id?: string
          provider?: string
          request_details?: string
          source_update_id?: number
          status?: string
          telegram_chat_id?: number
          telegram_user_id?: number
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount_cents: number
          balance_after_cents: number
          created_at: string
          id: string
          note: string | null
          reference_id: string | null
          telegram_user_id: number
          type: string
        }
        Insert: {
          amount_cents: number
          balance_after_cents: number
          created_at?: string
          id?: string
          note?: string | null
          reference_id?: string | null
          telegram_user_id: number
          type: string
        }
        Update: {
          amount_cents?: number
          balance_after_cents?: number
          created_at?: string
          id?: string
          note?: string | null
          reference_id?: string | null
          telegram_user_id?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_telegram_user_id_fkey"
            columns: ["telegram_user_id"]
            isOneToOne: false
            referencedRelation: "telegram_customers"
            referencedColumns: ["telegram_user_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      credit_telegram_wallet: {
        Args: {
          p_amount_cents: number
          p_chat_id: number
          p_note?: string
          p_reference_id: string
          p_type: string
          p_user_id: number
        }
        Returns: {
          applied: boolean
          balance_cents: number
        }[]
      }
      debit_telegram_wallet: {
        Args: {
          p_amount_cents: number
          p_note?: string
          p_reference_id: string
          p_user_id: number
        }
        Returns: {
          balance_cents: number
          error_code: string
          ok: boolean
        }[]
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
