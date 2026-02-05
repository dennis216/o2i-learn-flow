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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_summaries: {
        Row: {
          chapter_id: string | null
          content: string
          created_at: string
          id: string
          sub_chapter_id: string | null
          updated_at: string
        }
        Insert: {
          chapter_id?: string | null
          content: string
          created_at?: string
          id?: string
          sub_chapter_id?: string | null
          updated_at?: string
        }
        Update: {
          chapter_id?: string | null
          content?: string
          created_at?: string
          id?: string
          sub_chapter_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_summaries_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_summaries_sub_chapter_id_fkey"
            columns: ["sub_chapter_id"]
            isOneToOne: false
            referencedRelation: "sub_chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_tutor_chats: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          session_id: string | null
          topic: string | null
          user_id: string
          video_context: Json | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          session_id?: string | null
          topic?: string | null
          user_id: string
          video_context?: Json | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          session_id?: string | null
          topic?: string | null
          user_id?: string
          video_context?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_tutor_chats_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_tutor_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_tutor_sessions: {
        Row: {
          created_at: string
          id: string
          name: string
          topic: string | null
          updated_at: string
          user_id: string
          video_context: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          topic?: string | null
          updated_at?: string
          user_id: string
          video_context?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          topic?: string | null
          updated_at?: string
          user_id?: string
          video_context?: Json | null
        }
        Relationships: []
      }
      chapters: {
        Row: {
          created_at: string
          description: string | null
          id: string
          order_index: number
          roadmap_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number
          roadmap_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number
          roadmap_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapters_roadmap_id_fkey"
            columns: ["roadmap_id"]
            isOneToOne: false
            referencedRelation: "roadmaps"
            referencedColumns: ["id"]
          },
        ]
      }
      course_videos: {
        Row: {
          course_id: string
          created_at: string
          description: string | null
          duration: number | null
          exam_tips: string | null
          id: string
          notes_url: string | null
          order_index: number
          subtitle: string | null
          title: string
          transcript: Json | null
          updated_at: string
          video_url: string
        }
        Insert: {
          course_id: string
          created_at?: string
          description?: string | null
          duration?: number | null
          exam_tips?: string | null
          id?: string
          notes_url?: string | null
          order_index?: number
          subtitle?: string | null
          title: string
          transcript?: Json | null
          updated_at?: string
          video_url: string
        }
        Update: {
          course_id?: string
          created_at?: string
          description?: string | null
          duration?: number | null
          exam_tips?: string | null
          id?: string
          notes_url?: string | null
          order_index?: number
          subtitle?: string | null
          title?: string
          transcript?: Json | null
          updated_at?: string
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_videos_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          instructor_id: string
          level: string
          price: number | null
          subject: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          instructor_id: string
          level: string
          price?: number | null
          subject: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          instructor_id?: string
          level?: string
          price?: number | null
          subject?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "courses_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      discussion_posts: {
        Row: {
          content: string
          created_at: string
          forum_post_id: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          forum_post_id: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          forum_post_id?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discussion_posts_forum_post_id_fkey"
            columns: ["forum_post_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussion_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "discussion_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      forum_posts: {
        Row: {
          category: string | null
          content: string
          created_at: string
          id: string
          tags: string[] | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          id?: string
          tags?: string[] | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          id?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "forum_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      playground_links: {
        Row: {
          created_at: string
          description: string | null
          geogebra_url: string
          id: string
          order_index: number | null
          target_subject: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          geogebra_url: string
          id?: string
          order_index?: number | null
          target_subject: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          geogebra_url?: string
          id?: string
          order_index?: number | null
          target_subject?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      post_replies: {
        Row: {
          content: string
          created_at: string
          id: string
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_replies_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_replies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "post_replies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      practice_problems: {
        Row: {
          chapter_id: string | null
          content: string
          created_at: string
          id: string
          image_url: string | null
          lesson_number: string | null
          solution: string | null
          sub_chapter_id: string | null
          title: string
          unit_number: number | null
          updated_at: string
          video_id: string | null
        }
        Insert: {
          chapter_id?: string | null
          content: string
          created_at?: string
          id?: string
          image_url?: string | null
          lesson_number?: string | null
          solution?: string | null
          sub_chapter_id?: string | null
          title: string
          unit_number?: number | null
          updated_at?: string
          video_id?: string | null
        }
        Update: {
          chapter_id?: string | null
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          lesson_number?: string | null
          solution?: string | null
          sub_chapter_id?: string | null
          title?: string
          unit_number?: number | null
          updated_at?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "practice_problems_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_problems_sub_chapter_id_fkey"
            columns: ["sub_chapter_id"]
            isOneToOne: false
            referencedRelation: "sub_chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_problems_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "course_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_zombie: boolean
          role: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          is_zombie?: boolean
          role?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_zombie?: boolean
          role?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      roadmaps: {
        Row: {
          created_at: string
          description: string | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      solution_requests: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_public: boolean | null
          problem_type: Database["public"]["Enums"]["problem_type"] | null
          solution_image_url: string | null
          solution_text: string | null
          status: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_public?: boolean | null
          problem_type?: Database["public"]["Enums"]["problem_type"] | null
          solution_image_url?: string | null
          solution_text?: string | null
          status?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_public?: boolean | null
          problem_type?: Database["public"]["Enums"]["problem_type"] | null
          solution_image_url?: string | null
          solution_text?: string | null
          status?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solution_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "solution_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      sub_chapters: {
        Row: {
          chapter_id: string
          created_at: string
          description: string | null
          id: string
          order_index: number
          title: string
          updated_at: string
        }
        Insert: {
          chapter_id: string
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number
          title: string
          updated_at?: string
        }
        Update: {
          chapter_id?: string
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_chapters_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          category: string
          created_at: string
          icon_url: string | null
          id: string
          name: string
          order_index: number
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          icon_url?: string | null
          id?: string
          name: string
          order_index?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          icon_url?: string | null
          id?: string
          name?: string
          order_index?: number
          updated_at?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          bio: string | null
          created_at: string
          id: string
          name: string
          order_index: number
          photo_url: string | null
          role: string
          updated_at: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          id?: string
          name: string
          order_index?: number
          photo_url?: string | null
          role: string
          updated_at?: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          id?: string
          name?: string
          order_index?: number
          photo_url?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_progress: {
        Row: {
          chapter_id: string | null
          completed: boolean
          created_at: string
          id: string
          roadmap_id: string | null
          sub_chapter_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          chapter_id?: string | null
          completed?: boolean
          created_at?: string
          id?: string
          roadmap_id?: string | null
          sub_chapter_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          chapter_id?: string | null
          completed?: boolean
          created_at?: string
          id?: string
          roadmap_id?: string | null
          sub_chapter_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_progress_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_progress_roadmap_id_fkey"
            columns: ["roadmap_id"]
            isOneToOne: false
            referencedRelation: "roadmaps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_progress_sub_chapter_id_fkey"
            columns: ["sub_chapter_id"]
            isOneToOne: false
            referencedRelation: "sub_chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      video_lessons: {
        Row: {
          chapter_id: string | null
          created_at: string
          id: string
          sub_chapter_id: string | null
          title: string
          updated_at: string
          video_url: string
        }
        Insert: {
          chapter_id?: string | null
          created_at?: string
          id?: string
          sub_chapter_id?: string | null
          title: string
          updated_at?: string
          video_url: string
        }
        Update: {
          chapter_id?: string | null
          created_at?: string
          id?: string
          sub_chapter_id?: string | null
          title?: string
          updated_at?: string
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_lessons_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_lessons_sub_chapter_id_fkey"
            columns: ["sub_chapter_id"]
            isOneToOne: false
            referencedRelation: "sub_chapters"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string | null
          id: string | null
          role: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string | null
          role?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string | null
          role?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      count_real_users: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "instructor" | "student" | "super_admin"
      problem_type:
        | "geometry"
        | "algebra"
        | "calculus"
        | "number_theory"
        | "combinatorics"
        | "pre_calculus"
        | "statistics"
        | "other"
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
      app_role: ["admin", "instructor", "student", "super_admin"],
      problem_type: [
        "geometry",
        "algebra",
        "calculus",
        "number_theory",
        "combinatorics",
        "pre_calculus",
        "statistics",
        "other",
      ],
    },
  },
} as const
