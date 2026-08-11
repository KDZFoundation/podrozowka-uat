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
      authors: {
        Row: {
          id: string
          display_name: string
          legal_name: string | null
          email: string | null
          website_url: string | null
          social_handle: string | null
          bio: string | null
          avatar_url: string | null
          agreement_status: string
          agreement_signed_at: string | null
          agreement_expires_at: string | null
          agreement_file_url: string | null
          notes: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          display_name: string
          legal_name?: string | null
          email?: string | null
          website_url?: string | null
          social_handle?: string | null
          bio?: string | null
          avatar_url?: string | null
          agreement_status?: string
          agreement_signed_at?: string | null
          agreement_expires_at?: string | null
          agreement_file_url?: string | null
          notes?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string
          legal_name?: string | null
          email?: string | null
          website_url?: string | null
          social_handle?: string | null
          bio?: string | null
          avatar_url?: string | null
          agreement_status?: string
          agreement_signed_at?: string | null
          agreement_expires_at?: string | null
          agreement_file_url?: string | null
          notes?: string | null
          active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      card_design_images: {
        Row: {
          card_design_id: string
          created_at: string
          flag_url: string | null
          id: string
          sort_order: number
          url: string
        }
        Insert: {
          card_design_id: string
          created_at?: string
          flag_url?: string | null
          id?: string
          sort_order?: number
          url: string
        }
        Update: {
          card_design_id?: string
          created_at?: string
          flag_url?: string | null
          id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_design_images_card_design_id_fkey"
            columns: ["card_design_id"]
            isOneToOne: false
            referencedRelation: "card_designs"
            referencedColumns: ["id"]
          },
        ]
      }
      card_designs: {
        Row: {
          author_id: string | null
          active: boolean
          back_qr_label: string | null
          category_id: string | null
          country_id: string
          created_at: string
          crop_settings: Json | null
          currency: string
          description: string | null
          id: string
          image_front_url: string | null
          language_code: string
          photo_author: string | null
          price_grosze: number
          thank_you_text: string | null
          title: string | null
          updated_at: string
          view_no: number
        }
        Insert: {
          author_id?: string | null
          active?: boolean
          back_qr_label?: string | null
          category_id?: string | null
          country_id: string
          created_at?: string
          crop_settings?: Json | null
          currency?: string
          description?: string | null
          id?: string
          image_front_url?: string | null
          language_code?: string
          photo_author?: string | null
          price_grosze?: number
          thank_you_text?: string | null
          title?: string | null
          updated_at?: string
          view_no: number
        }
        Update: {
          author_id?: string | null
          active?: boolean
          back_qr_label?: string | null
          category_id?: string | null
          country_id?: string
          created_at?: string
          crop_settings?: Json | null
          currency?: string
          description?: string | null
          id?: string
          image_front_url?: string | null
          language_code?: string
          photo_author?: string | null
          price_grosze?: number
          thank_you_text?: string | null
          title?: string | null
          updated_at?: string
          view_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "card_designs_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_designs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designs_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      card_language_templates: {
        Row: {
          back_qr_label: string
          country_id: string
          created_at: string
          front_thank_you_text: string
          id: string
          language_code: string
          language_name: string
          updated_at: string
        }
        Insert: {
          back_qr_label: string
          country_id: string
          created_at?: string
          front_thank_you_text: string
          id?: string
          language_code: string
          language_name: string
          updated_at?: string
        }
        Update: {
          back_qr_label?: string
          country_id?: string
          created_at?: string
          front_thank_you_text?: string
          id?: string
          language_code?: string
          language_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_language_templates_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          icon_url: string | null
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          icon_url?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          icon_url?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      countries: {
        Row: {
          active: boolean
          created_at: string
          id: string
          iso2: string
          iso3: string | null
          name_pl: string
          slug: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          iso2: string
          iso3?: string | null
          name_pl: string
          slug?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          iso2?: string
          iso3?: string | null
          name_pl?: string
          slug?: string | null
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          description: string
          is_enabled: boolean
          key: string
          name: string
        }
        Insert: {
          description?: string
          is_enabled?: boolean
          key: string
          name: string
        }
        Update: {
          description?: string
          is_enabled?: boolean
          key?: string
          name?: string
        }
        Relationships: []
      }
      gamification_config: {
        Row: {
          id: number
          points_per_country: number
          points_per_registration: number
          points_per_unit: number
          updated_at: string
        }
        Insert: {
          id?: number
          points_per_country?: number
          points_per_registration?: number
          points_per_unit?: number
          updated_at?: string
        }
        Update: {
          id?: number
          points_per_country?: number
          points_per_registration?: number
          points_per_unit?: number
          updated_at?: string
        }
        Relationships: []
      }
      gamification_tiers: {
        Row: {
          created_at: string
          id: string
          min_points: number
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          min_points: number
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          min_points?: number
          name?: string
        }
        Relationships: []
      }
      inventory_unit_events: {
        Row: {
          actor_id: string | null
          actor_type: Database["public"]["Enums"]["event_actor_type"]
          created_at: string
          event_type: Database["public"]["Enums"]["inventory_event_type"]
          id: string
          inventory_unit_id: string
          payload_json: Json | null
        }
        Insert: {
          actor_id?: string | null
          actor_type?: Database["public"]["Enums"]["event_actor_type"]
          created_at?: string
          event_type: Database["public"]["Enums"]["inventory_event_type"]
          id?: string
          inventory_unit_id: string
          payload_json?: Json | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: Database["public"]["Enums"]["event_actor_type"]
          created_at?: string
          event_type?: Database["public"]["Enums"]["inventory_event_type"]
          id?: string
          inventory_unit_id?: string
          payload_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_unit_events_inventory_unit_id_fkey"
            columns: ["inventory_unit_id"]
            isOneToOne: false
            referencedRelation: "inventory_units"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_units: {
        Row: {
          business_status: Database["public"]["Enums"]["business_status"] | null
          card_design_id: string
          created_at: string
          fulfillment_status: Database["public"]["Enums"]["fulfillment_status"]
          id: string
          internal_inventory_code: string
          order_id: string | null
          order_item_id: string | null
          public_claim_code: string | null
          public_claim_token_hash: string | null
          qr_applied_at: string | null
          qr_generated_at: string | null
          registered_at: string | null
          shipment_id: string | null
          shipped_at: string | null
          stock_batch_id: string
          traveler_user_id: string | null
          updated_at: string
        }
        Insert: {
          business_status?:
            | Database["public"]["Enums"]["business_status"]
            | null
          card_design_id: string
          created_at?: string
          fulfillment_status?: Database["public"]["Enums"]["fulfillment_status"]
          id?: string
          internal_inventory_code: string
          order_id?: string | null
          order_item_id?: string | null
          public_claim_code?: string | null
          public_claim_token_hash?: string | null
          qr_applied_at?: string | null
          qr_generated_at?: string | null
          registered_at?: string | null
          shipment_id?: string | null
          shipped_at?: string | null
          stock_batch_id: string
          traveler_user_id?: string | null
          updated_at?: string
        }
        Update: {
          business_status?:
            | Database["public"]["Enums"]["business_status"]
            | null
          card_design_id?: string
          created_at?: string
          fulfillment_status?: Database["public"]["Enums"]["fulfillment_status"]
          id?: string
          internal_inventory_code?: string
          order_id?: string | null
          order_item_id?: string | null
          public_claim_code?: string | null
          public_claim_token_hash?: string | null
          qr_applied_at?: string | null
          qr_generated_at?: string | null
          registered_at?: string | null
          shipment_id?: string | null
          shipped_at?: string | null
          stock_batch_id?: string
          traveler_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_units_card_design_id_fkey"
            columns: ["card_design_id"]
            isOneToOne: false
            referencedRelation: "card_designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_units_stock_batch_id_fkey"
            columns: ["stock_batch_id"]
            isOneToOne: false
            referencedRelation: "stock_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_gamification_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      order_items: {
        Row: {
          card_design_id: string
          created_at: string
          id: string
          order_id: string
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          card_design_id: string
          created_at?: string
          id?: string
          order_id: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Update: {
          card_design_id?: string
          created_at?: string
          id?: string
          order_id?: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_card_design_id_fkey"
            columns: ["card_design_id"]
            isOneToOne: false
            referencedRelation: "card_designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancelled_at: string | null
          company_address: string | null
          company_name: string | null
          company_nip: string | null
          created_at: string
          customer_email: string | null
          currency: string
          fiscal_document_error: string | null
          fiscal_document_external_id: string | null
          fiscal_document_issued_at: string | null
          fiscal_document_number: string | null
          fiscal_document_status: string | null
          fiscal_document_url: string | null
          fulfilled_at: string | null
          id: string
          invoice_requested: boolean
          notes: string | null
          order_number: string
          paid_at: string | null
          payment_method: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          pickup_point_address: string | null
          pickup_point_city: string | null
          pickup_point_name: string | null
          shipping_address: string | null
          shipping_city: string | null
          shipping_cost: number
          shipping_country: string | null
          shipping_method: string
          shipping_name: string | null
          shipping_phone: string | null
          shipping_postal_code: string | null
          status: Database["public"]["Enums"]["order_status"]
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          company_address?: string | null
          company_name?: string | null
          company_nip?: string | null
          created_at?: string
          customer_email?: string | null
          currency?: string
          fiscal_document_error?: string | null
          fiscal_document_external_id?: string | null
          fiscal_document_issued_at?: string | null
          fiscal_document_number?: string | null
          fiscal_document_status?: string | null
          fiscal_document_url?: string | null
          fulfilled_at?: string | null
          id?: string
          invoice_requested?: boolean
          notes?: string | null
          order_number?: string
          paid_at?: string | null
          payment_method?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pickup_point_address?: string | null
          pickup_point_city?: string | null
          pickup_point_name?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_cost?: number
          shipping_country?: string | null
          shipping_method?: string
          shipping_name?: string | null
          shipping_phone?: string | null
          shipping_postal_code?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          company_address?: string | null
          company_name?: string | null
          company_nip?: string | null
          created_at?: string
          customer_email?: string | null
          currency?: string
          fiscal_document_error?: string | null
          fiscal_document_external_id?: string | null
          fiscal_document_issued_at?: string | null
          fiscal_document_number?: string | null
          fiscal_document_status?: string | null
          fiscal_document_url?: string | null
          fulfilled_at?: string | null
          id?: string
          invoice_requested?: boolean
          notes?: string | null
          order_number?: string
          paid_at?: string | null
          payment_method?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pickup_point_address?: string | null
          pickup_point_city?: string | null
          pickup_point_name?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_cost?: number
          shipping_country?: string | null
          shipping_method?: string
          shipping_name?: string | null
          shipping_phone?: string | null
          shipping_postal_code?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_settings: {
        Row: {
          created_at: string
          id: string
          p24_mode: string
          singleton: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          p24_mode?: string
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          p24_mode?: string
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      platform_stats: {
        Row: {
          id: string
          total_countries: number
          total_given: number
          total_members: number
          total_purchased: number
          total_registered: number
          updated_at: string
        }
        Insert: {
          id?: string
          total_countries?: number
          total_given?: number
          total_members?: number
          total_purchased?: number
          total_registered?: number
          updated_at?: string
        }
        Update: {
          id?: string
          total_countries?: number
          total_given?: number
          total_members?: number
          total_purchased?: number
          total_registered?: number
          updated_at?: string
        }
        Relationships: []
      }
      postcards: {
        Row: {
          buyer_display_name: string | null
          buyer_id: string | null
          created_at: string
          design_id: string
          id: string
          order_reference: string | null
          purchased_at: string | null
          qr_token: string
          recipient_email: string | null
          recipient_message: string | null
          recipient_name: string | null
          registered_at: string | null
          serial_number: number
          status: string
          updated_at: string
        }
        Insert: {
          buyer_display_name?: string | null
          buyer_id?: string | null
          created_at?: string
          design_id: string
          id?: string
          order_reference?: string | null
          purchased_at?: string | null
          qr_token: string
          recipient_email?: string | null
          recipient_message?: string | null
          recipient_name?: string | null
          registered_at?: string | null
          serial_number: number
          status?: string
          updated_at?: string
        }
        Update: {
          buyer_display_name?: string | null
          buyer_id?: string | null
          created_at?: string
          design_id?: string
          id?: string
          order_reference?: string | null
          purchased_at?: string | null
          qr_token?: string
          recipient_email?: string | null
          recipient_message?: string | null
          recipient_name?: string | null
          registered_at?: string | null
          serial_number?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "postcards_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "card_designs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          city: string | null
          country: string | null
          created_at: string
          current_rank: string
          display_name: string | null
          first_name: string | null
          id: string
          last_name: string | null
          postcards_purchased: number
          postcards_received: number
          total_kilometers: number
          total_points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          current_rank?: string
          display_name?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          postcards_purchased?: number
          postcards_received?: number
          total_kilometers?: number
          total_points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          current_rank?: string
          display_name?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          postcards_purchased?: number
          postcards_received?: number
          total_kilometers?: number
          total_points?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      qr_print_job_items: {
        Row: {
          generated_at: string
          id: string
          inventory_unit_id: string
          print_job_id: string
          public_claim_code: string
          qr_url: string
        }
        Insert: {
          generated_at?: string
          id?: string
          inventory_unit_id: string
          print_job_id: string
          public_claim_code: string
          qr_url: string
        }
        Update: {
          generated_at?: string
          id?: string
          inventory_unit_id?: string
          print_job_id?: string
          public_claim_code?: string
          qr_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_print_job_items_inventory_unit_id_fkey"
            columns: ["inventory_unit_id"]
            isOneToOne: false
            referencedRelation: "inventory_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_print_job_items_print_job_id_fkey"
            columns: ["print_job_id"]
            isOneToOne: false
            referencedRelation: "qr_print_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_print_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          generated_items: number
          id: string
          name: string
          order_id: string | null
          shipment_id: string | null
          status: Database["public"]["Enums"]["qr_print_job_status"]
          total_items: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          generated_items?: number
          id?: string
          name: string
          order_id?: string | null
          shipment_id?: string | null
          status?: Database["public"]["Enums"]["qr_print_job_status"]
          total_items?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          generated_items?: number
          id?: string
          name?: string
          order_id?: string | null
          shipment_id?: string | null
          status?: Database["public"]["Enums"]["qr_print_job_status"]
          total_items?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_print_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      recipient_registrations: {
        Row: {
          contact_opt_in: boolean
          created_at: string
          id: string
          inventory_unit_id: string
          latitude: number | null
          longitude: number | null
          recipient_email: string | null
          recipient_message: string | null
          recipient_name: string
          registered_at: string
        }
        Insert: {
          contact_opt_in?: boolean
          created_at?: string
          id?: string
          inventory_unit_id: string
          latitude?: number | null
          longitude?: number | null
          recipient_email?: string | null
          recipient_message?: string | null
          recipient_name: string
          registered_at?: string
        }
        Update: {
          contact_opt_in?: boolean
          created_at?: string
          id?: string
          inventory_unit_id?: string
          latitude?: number | null
          longitude?: number | null
          recipient_email?: string | null
          recipient_message?: string | null
          recipient_name?: string
          registered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipient_registrations_inventory_unit_id_fkey"
            columns: ["inventory_unit_id"]
            isOneToOne: true
            referencedRelation: "inventory_units"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          carrier: string | null
          created_at: string
          delivered_at: string | null
          id: string
          notes: string | null
          order_id: string
          shipped_at: string | null
          shipping_method: string | null
          status: Database["public"]["Enums"]["shipment_status"]
          tracking_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          notes?: string | null
          order_id: string
          shipped_at?: string | null
          shipping_method?: string | null
          status?: Database["public"]["Enums"]["shipment_status"]
          tracking_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          shipped_at?: string | null
          shipping_method?: string | null
          status?: Database["public"]["Enums"]["shipment_status"]
          tracking_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_batches: {
        Row: {
          card_design_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          quantity: number
          updated_at: string
        }
        Insert: {
          card_design_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          card_design_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_batches_card_design_id_fkey"
            columns: ["card_design_id"]
            isOneToOne: false
            referencedRelation: "card_designs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      profiles_public: {
        Row: {
          avatar_url: string | null
          current_rank: string | null
          display_name: string | null
          id: string | null
          postcards_purchased: number | null
          postcards_received: number | null
          total_kilometers: number | null
          total_points: number | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          current_rank?: string | null
          display_name?: string | null
          id?: string | null
          postcards_purchased?: number | null
          postcards_received?: number | null
          total_kilometers?: number | null
          total_points?: number | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          current_rank?: string | null
          display_name?: string | null
          id?: string | null
          postcards_purchased?: number | null
          postcards_received?: number | null
          total_kilometers?: number | null
          total_points?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      traveler_registrations_view: {
        Row: {
          contact_opt_in: boolean | null
          created_at: string | null
          id: string | null
          inventory_unit_id: string | null
          recipient_email: string | null
          recipient_message: string | null
          recipient_name: string | null
          registered_at: string | null
        }
        Insert: {
          contact_opt_in?: boolean | null
          created_at?: string | null
          id?: string | null
          inventory_unit_id?: string | null
          recipient_email?: never
          recipient_message?: string | null
          recipient_name?: string | null
          registered_at?: string | null
        }
        Update: {
          contact_opt_in?: boolean | null
          created_at?: string | null
          id?: string | null
          inventory_unit_id?: string | null
          recipient_email?: never
          recipient_message?: string | null
          recipient_name?: string | null
          registered_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipient_registrations_inventory_unit_id_fkey"
            columns: ["inventory_unit_id"]
            isOneToOne: true
            referencedRelation: "inventory_units"
            referencedColumns: ["id"]
          },
        ]
      }
      user_gamification_stats: {
        Row: {
          display_name: string | null
          impact_rank: string | null
          registration_count: number | null
          total_points: number | null
          unique_countries: number | null
          unit_count: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_list_recipient_registrations: {
        Args: never
        Returns: {
          contact_opt_in: boolean
          created_at: string
          id: string
          inventory_unit_id: string
          latitude: number | null
          longitude: number | null
          recipient_email: string | null
          recipient_message: string | null
          recipient_name: string
          registered_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "recipient_registrations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      calculate_distance: {
        Args: { lat1: number; lat2: number; lon1: number; lon2: number }
        Returns: number
      }
      calculate_user_impact_points: {
        Args: { _user_id: string }
        Returns: undefined
      }
      create_order:
        | {
            Args: {
              _company_address?: string
              _company_name?: string
              _company_nip?: string
              _invoice_requested?: boolean
              _items: Json
              _pickup_point_address: string
              _pickup_point_city: string
              _pickup_point_name: string
              _shipping_cost: number
            }
            Returns: Json
          }
        | {
            Args: {
              _company_address?: string
              _company_name?: string
              _company_nip?: string
              _invoice_requested?: boolean
              _items: Json
              _payment_method?: string
              _pickup_point_address: string
              _pickup_point_city: string
              _pickup_point_name: string
              _shipping_city?: string
              _shipping_cost: number
              _shipping_method?: string
              _shipping_name?: string
              _shipping_phone?: string
              _shipping_postal_code?: string
              _shipping_street?: string
            }
            Returns: Json
          }
      generate_claim_code: { Args: never; Returns: string }
      generate_order_number: { Args: never; Returns: string }
      generate_tracking_code: { Args: never; Returns: string }
      get_product_stock: { Args: { _id: string }; Returns: number }
      get_products_stock: {
        Args: never
        Returns: {
          card_design_id: string
          in_stock: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_valid_nip: { Args: { _nip: string }; Returns: boolean }
      recalculate_user_gamification: {
        Args: { _user_id: string }
        Returns: undefined
      }
      register_recipient: {
        Args: {
          _contact_opt_in: boolean
          _latitude: number
          _longitude: number
          _recipient_email: string
          _recipient_message: string
          _recipient_name: string
          _unit_id: string
        }
        Returns: undefined
      }
      reserve_inventory_for_order: {
        Args: { _order_id: string }
        Returns: Json
      }
      update_country_count: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "traveler" | "admin"
      business_status: "purchased" | "registered"
      event_actor_type: "system" | "admin" | "traveler" | "recipient"
      fulfillment_status:
        | "in_stock"
        | "reserved"
        | "qr_generated"
        | "qr_applied"
        | "shipped"
        | "voided"
        | "damaged"
      inventory_event_type:
        | "created_in_stock"
        | "reserved_for_order"
        | "qr_generated"
        | "qr_applied"
        | "shipped"
        | "registered"
        | "voided"
        | "damaged"
      order_status: "pending" | "paid" | "fulfilled" | "cancelled"
      payment_status: "unpaid" | "paid" | "refunded" | "failed"
      qr_print_job_status:
        | "pending"
        | "generating"
        | "ready"
        | "printed"
        | "failed"
      shipment_status:
        | "pending"
        | "packed"
        | "shipped"
        | "delivered"
        | "returned"
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
      app_role: ["traveler", "admin"],
      business_status: ["purchased", "registered"],
      event_actor_type: ["system", "admin", "traveler", "recipient"],
      fulfillment_status: [
        "in_stock",
        "reserved",
        "qr_generated",
        "qr_applied",
        "shipped",
        "voided",
        "damaged",
      ],
      inventory_event_type: [
        "created_in_stock",
        "reserved_for_order",
        "qr_generated",
        "qr_applied",
        "shipped",
        "registered",
        "voided",
        "damaged",
      ],
      order_status: ["pending", "paid", "fulfilled", "cancelled"],
      payment_status: ["unpaid", "paid", "refunded", "failed"],
      qr_print_job_status: [
        "pending",
        "generating",
        "ready",
        "printed",
        "failed",
      ],
      shipment_status: [
        "pending",
        "packed",
        "shipped",
        "delivered",
        "returned",
      ],
    },
  },
} as const
