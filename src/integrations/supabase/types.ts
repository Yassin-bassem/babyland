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
      app_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_new: boolean
          name: string
          phone: string
          shop_name: string | null
          updated_at: string
          version_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_new?: boolean
          name: string
          phone: string
          shop_name?: string | null
          updated_at?: string
          version_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_new?: boolean
          name?: string
          phone?: string
          shop_name?: string | null
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "versions"
            referencedColumns: ["id"]
          },
        ]
      }
      deposits: {
        Row: {
          amount: number
          branch?: string | null
          created_at: string
          customer_name: string
          id: string
          method: string
          order_id: string
          order_number: number
          version_id: string
        }
        Insert: {
          amount: number
          branch?: string | null
          created_at?: string
          customer_name: string
          id?: string
          method: string
          order_id: string
          order_number: number
          version_id: string
        }
        Update: {
          amount?: number
          branch?: string | null
          created_at?: string
          customer_name?: string
          id?: string
          method?: string
          order_id?: string
          order_number?: number
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposits_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposits_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "versions"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          created_at: string
          description: string
          expense_date: string
          id: string
          version_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description: string
          expense_date?: string
          id?: string
          version_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          expense_date?: string
          id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "versions"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          cancelled: boolean
          created_at: string
          fulfilled: boolean
          id: string
          order_id: string
          price: number
          product_code: string
          product_description: string | null
          product_id: string
          product_name: string
          quantity: number
          version_id: string
        }
        Insert: {
          cancelled?: boolean
          created_at?: string
          fulfilled?: boolean
          id?: string
          order_id: string
          price: number
          product_code: string
          product_description?: string | null
          product_id: string
          product_name: string
          quantity?: number
          version_id: string
        }
        Update: {
          cancelled?: boolean
          created_at?: string
          fulfilled?: boolean
          id?: string
          order_id?: string
          price?: number
          product_code?: string
          product_description?: string | null
          product_id?: string
          product_name?: string
          quantity?: number
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "versions"
            referencedColumns: ["id"]
          },
        ]
      }
      order_refunds: {
        Row: {
          created_at: string
          id: string
          order_id: string
          price: number
          product_code: string
          product_description: string | null
          product_id: string | null
          product_name: string
          quantity: number
          version_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          price?: number
          product_code: string
          product_description?: string | null
          product_id?: string | null
          product_name: string
          quantity?: number
          version_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          price?: number
          product_code?: string
          product_description?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          version_id?: string
        }
        Relationships: []
      }
      order_returns: {
        Row: {
          address: string | null
          created_at: string
          customer_name: string
          id: string
          notes: string | null
          phone: string
          product_code: string
          product_description: string | null
          product_name: string
          quantity: number
          shop_name: string | null
          total_amount: number
          unit_price: number
          updated_at: string
          version_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          customer_name: string
          id?: string
          notes?: string | null
          phone: string
          product_code: string
          product_description?: string | null
          product_name: string
          quantity?: number
          shop_name?: string | null
          total_amount?: number
          unit_price?: number
          updated_at?: string
          version_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          customer_name?: string
          id?: string
          notes?: string | null
          phone?: string
          product_code?: string
          product_description?: string | null
          product_name?: string
          quantity?: number
          shop_name?: string | null
          total_amount?: number
          unit_price?: number
          updated_at?: string
          version_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          address: string | null
          branch: string | null
          created_at: string
          customer_id: string | null
          customer_name: string
          delivery_date: string | null
          deposit_amount: number | null
          deposit_method: string | null
          extra_info: string | null
          id: string
          order_number: number
          phone: string
          progress_status: string
          shipping_company: string | null
          shop_name: string | null
          staff_member_id: string | null
          staff_member_name: string | null
          status: string
          subtotal: number
          total: number
          updated_at: string
          version_id: string
        }
        Insert: {
          address?: string | null
          branch?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name: string
          delivery_date?: string | null
          deposit_amount?: number | null
          deposit_method?: string | null
          extra_info?: string | null
          id?: string
          order_number?: number
          phone: string
          progress_status?: string
          shipping_company?: string | null
          shop_name?: string | null
          staff_member_id?: string | null
          staff_member_name?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          version_id: string
        }
        Update: {
          address?: string | null
          branch?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          delivery_date?: string | null
          deposit_amount?: number | null
          deposit_method?: string | null
          extra_info?: string | null
          id?: string
          order_number?: number
          phone?: string
          progress_status?: string
          shipping_company?: string | null
          shop_name?: string | null
          staff_member_id?: string | null
          staff_member_name?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "versions"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          low_stock_threshold: number
          name: string
          price: number
          stock_quantity: number
          updated_at: string
          version_id: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          low_stock_threshold?: number
          name: string
          price?: number
          stock_quantity?: number
          updated_at?: string
          version_id: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          low_stock_threshold?: number
          name?: string
          price?: number
          stock_quantity?: number
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "versions"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_details: {
        Row: {
          created_at: string
          customer_name: string
          id: string
          is_correct: boolean
          phone: string
          shipping_company: string
          shipping_data: string
          shop_name: string | null
          updated_at: string
          version_id: string
        }
        Insert: {
          created_at?: string
          customer_name: string
          id?: string
          is_correct?: boolean
          phone: string
          shipping_company: string
          shipping_data: string
          shop_name?: string | null
          updated_at?: string
          version_id: string
        }
        Update: {
          created_at?: string
          customer_name?: string
          id?: string
          is_correct?: boolean
          phone?: string
          shipping_company?: string
          shipping_data?: string
          shop_name?: string | null
          updated_at?: string
          version_id?: string
        }
        Relationships: []
      }
      staff_members: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          password: string
          permissions: string[]
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          password: string
          permissions?: string[]
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          password?: string
          permissions?: string[]
        }
        Relationships: []
      }
      stock_alerts: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          created_at: string
          id: string
          product_code: string
          product_id: string
          product_name: string
          remaining_quantity: number
          version_id: string
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          created_at?: string
          id?: string
          product_code: string
          product_id: string
          product_name: string
          remaining_quantity?: number
          version_id: string
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          created_at?: string
          id?: string
          product_code?: string
          product_id?: string
          product_name?: string
          remaining_quantity?: number
          version_id?: string
        }
        Relationships: []
      }
      versions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      execute_readonly_sql: { Args: { query: string }; Returns: Json }
      get_next_order_number: { Args: { p_version_id: string }; Returns: number }
      reset_order_number_sequence: { Args: never; Returns: undefined }
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
