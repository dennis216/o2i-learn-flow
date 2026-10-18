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
      admin_emails: {
        Row: {
          created_at: string | null
          created_by: string | null
          email: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          email: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          email?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
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
      course_curriculum_units: {
        Row: {
          course_id: string
          order_index: number
          unit_id: string
        }
        Insert: {
          course_id: string
          order_index: number
          unit_id: string
        }
        Update: {
          course_id?: string
          order_index?: number
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_curriculum_units_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_curriculum_units_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "curriculum_units"
            referencedColumns: ["id"]
          },
        ]
      }
      course_videos: {
        Row: {
          course_id: string
          created_at: string
          curriculum_topic_id: string | null
          description: string | null
          duration: number | null
          exam_tips: string | null
          id: string
          notes_url: string | null
          order_index: number
          playground_url: string | null
          subtitle: string | null
          title: string
          transcript: Json | null
          unit: string | null
          updated_at: string
          video_url: string
        }
        Insert: {
          course_id: string
          created_at?: string
          curriculum_topic_id?: string | null
          description?: string | null
          duration?: number | null
          exam_tips?: string | null
          id?: string
          notes_url?: string | null
          order_index?: number
          playground_url?: string | null
          subtitle?: string | null
          title: string
          transcript?: Json | null
          unit?: string | null
          updated_at?: string
          video_url: string
        }
        Update: {
          course_id?: string
          created_at?: string
          curriculum_topic_id?: string | null
          description?: string | null
          duration?: number | null
          exam_tips?: string | null
          id?: string
          notes_url?: string | null
          order_index?: number
          playground_url?: string | null
          subtitle?: string | null
          title?: string
          transcript?: Json | null
          unit?: string | null
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
          {
            foreignKeyName: "course_videos_curriculum_topic_id_fkey"
            columns: ["curriculum_topic_id"]
            isOneToOne: false
            referencedRelation: "curriculum_topics"
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
          is_published: boolean
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
          is_published?: boolean
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
          is_published?: boolean
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
      curriculum_frameworks: {
        Row: {
          code: string
          created_at: string
          id: string
          source_title: string
          title: string
          updated_at: string
          version: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          source_title: string
          title: string
          updated_at?: string
          version: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          source_title?: string
          title?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      curriculum_learning_objectives: {
        Row: {
          created_at: string
          id: string
          objective_code: string
          order_index: number
          statement: string
          topic_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          objective_code: string
          order_index?: number
          statement: string
          topic_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          objective_code?: string
          order_index?: number
          statement?: string
          topic_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_learning_objectives_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "curriculum_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_practice_skills: {
        Row: {
          assessed: boolean
          description: string
          id: string
          practice_code: number
          skill_code: string
        }
        Insert: {
          assessed?: boolean
          description: string
          id?: string
          practice_code: number
          skill_code: string
        }
        Update: {
          assessed?: boolean
          description?: string
          id?: string
          practice_code?: number
          skill_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_practice_skills_practice_code_fkey"
            columns: ["practice_code"]
            isOneToOne: false
            referencedRelation: "curriculum_practices"
            referencedColumns: ["code"]
          },
        ]
      }
      curriculum_practices: {
        Row: {
          code: number
          description: string
          name: string
        }
        Insert: {
          code: number
          description: string
          name: string
        }
        Update: {
          code?: number
          description?: string
          name?: string
        }
        Relationships: []
      }
      curriculum_topics: {
        Row: {
          big_idea: string
          created_at: string
          id: string
          is_bc_only: boolean
          order_index: number
          title: string
          topic_code: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          big_idea: string
          created_at?: string
          id?: string
          is_bc_only?: boolean
          order_index: number
          title: string
          topic_code: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          big_idea?: string
          created_at?: string
          id?: string
          is_bc_only?: boolean
          order_index?: number
          title?: string
          topic_code?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_topics_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "curriculum_units"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_units: {
        Row: {
          ab_exam_weight_max: number | null
          ab_exam_weight_min: number | null
          ab_periods_max: number | null
          ab_periods_min: number | null
          bc_exam_weight_max: number | null
          bc_exam_weight_min: number | null
          bc_periods_max: number | null
          bc_periods_min: number | null
          created_at: string
          framework_id: string
          id: string
          is_bc_only: boolean
          title: string
          unit_number: number
          updated_at: string
        }
        Insert: {
          ab_exam_weight_max?: number | null
          ab_exam_weight_min?: number | null
          ab_periods_max?: number | null
          ab_periods_min?: number | null
          bc_exam_weight_max?: number | null
          bc_exam_weight_min?: number | null
          bc_periods_max?: number | null
          bc_periods_min?: number | null
          created_at?: string
          framework_id: string
          id?: string
          is_bc_only?: boolean
          title: string
          unit_number: number
          updated_at?: string
        }
        Update: {
          ab_exam_weight_max?: number | null
          ab_exam_weight_min?: number | null
          ab_periods_max?: number | null
          ab_periods_min?: number | null
          bc_exam_weight_max?: number | null
          bc_exam_weight_min?: number | null
          bc_periods_max?: number | null
          bc_periods_min?: number | null
          created_at?: string
          framework_id?: string
          id?: string
          is_bc_only?: boolean
          title?: string
          unit_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_units_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "curriculum_frameworks"
            referencedColumns: ["id"]
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
          profile_id: string | null
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
          profile_id?: string | null
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
          profile_id?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_posts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_posts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
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
      misconceptions: {
        Row: {
          code: string
          created_at: string
          description: string
          framework_id: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          framework_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          framework_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "misconceptions_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "curriculum_frameworks"
            referencedColumns: ["id"]
          },
        ]
      }
      option_misconceptions: {
        Row: {
          created_at: string
          misconception_id: string
          option_id: string
        }
        Insert: {
          created_at?: string
          misconception_id: string
          option_id: string
        }
        Update: {
          created_at?: string
          misconception_id?: string
          option_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "option_misconceptions_misconception_id_fkey"
            columns: ["misconception_id"]
            isOneToOne: false
            referencedRelation: "misconceptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "option_misconceptions_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "question_options"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_zombie_comments: {
        Row: {
          comment_content: string
          created_at: string
          executed: boolean | null
          id: string
          post_id: string
          scheduled_at: string
          zombie_user_id: string
        }
        Insert: {
          comment_content: string
          created_at?: string
          executed?: boolean | null
          id?: string
          post_id: string
          scheduled_at: string
          zombie_user_id: string
        }
        Update: {
          comment_content?: string
          created_at?: string
          executed?: boolean | null
          id?: string
          post_id?: string
          scheduled_at?: string
          zombie_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_zombie_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
            referencedColumns: ["id"]
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
          profile_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          post_id: string
          profile_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          profile_id?: string | null
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
            foreignKeyName: "post_replies_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_replies_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
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
          user_id: string | null
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
          user_id?: string | null
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
          user_id?: string | null
        }
        Relationships: []
      }
      question_course_videos: {
        Row: {
          course_video_id: string
          created_at: string
          question_id: string
        }
        Insert: {
          course_video_id: string
          created_at?: string
          question_id: string
        }
        Update: {
          course_video_id?: string
          created_at?: string
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_course_videos_course_video_id_fkey"
            columns: ["course_video_id"]
            isOneToOne: false
            referencedRelation: "course_videos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_course_videos_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_options: {
        Row: {
          created_at: string
          id: string
          import_evidence: NonNullable<Json>
          is_correct: boolean
          option_key: string
          option_text: string
          order_index: number
          question_version_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          import_evidence?: NonNullable<Json>
          is_correct?: boolean
          option_key: string
          option_text: string
          order_index: number
          question_version_id: string
        }
        Update: {
          created_at?: string
          id?: string
          import_evidence?: NonNullable<Json>
          is_correct?: boolean
          option_key?: string
          option_text?: string
          order_index?: number
          question_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_options_question_version_id_fkey"
            columns: ["question_version_id"]
            isOneToOne: false
            referencedRelation: "question_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_practice_skills: {
        Row: {
          created_at: string
          practice_skill_id: string
          question_version_id: string
        }
        Insert: {
          created_at?: string
          practice_skill_id: string
          question_version_id: string
        }
        Update: {
          created_at?: string
          practice_skill_id?: string
          question_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_practice_skills_practice_skill_id_fkey"
            columns: ["practice_skill_id"]
            isOneToOne: false
            referencedRelation: "curriculum_practice_skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_practice_skills_question_version_id_fkey"
            columns: ["question_version_id"]
            isOneToOne: false
            referencedRelation: "question_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_topics: {
        Row: {
          created_at: string
          question_version_id: string
          topic_id: string
        }
        Insert: {
          created_at?: string
          question_version_id: string
          topic_id: string
        }
        Update: {
          created_at?: string
          question_version_id?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_topics_question_version_id_fkey"
            columns: ["question_version_id"]
            isOneToOne: false
            referencedRelation: "question_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_topics_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "curriculum_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      question_versions: {
        Row: {
          approved_at: string | null
          calculator_policy: Database["public"]["Enums"]["question_calculator_policy"] | null
          course_scope: Database["public"]["Enums"]["question_course_scope"]
          created_at: string
          created_by: string
          difficulty: Database["public"]["Enums"]["question_difficulty"]
          id: string
          image_url: string | null
          import_evidence: NonNullable<Json>
          primary_topic_id: string
          question_id: string
          question_type: Database["public"]["Enums"]["question_type"]
          representation_type: Database["public"]["Enums"]["question_representation_type"]
          requires_figure: boolean
          reviewed_by: string | null
          solution: string
          source_document: string
          source_locator: string | null
          source_locator_verified: boolean
          source_page: number
          source_question_number: string | null
          source_reference: string | null
          source_type: Database["public"]["Enums"]["question_source_type"] | null
          status: Database["public"]["Enums"]["question_version_status"]
          stem: string
          version_number: number
        }
        Insert: {
          approved_at?: string | null
          calculator_policy?: Database["public"]["Enums"]["question_calculator_policy"] | null
          course_scope: Database["public"]["Enums"]["question_course_scope"]
          created_at?: string
          created_by?: string
          difficulty: Database["public"]["Enums"]["question_difficulty"]
          id?: string
          image_url?: string | null
          import_evidence?: NonNullable<Json>
          primary_topic_id: string
          question_id: string
          question_type?: Database["public"]["Enums"]["question_type"]
          representation_type: Database["public"]["Enums"]["question_representation_type"]
          requires_figure?: boolean
          reviewed_by?: string | null
          solution: string
          source_document: string
          source_locator?: string | null
          source_locator_verified?: boolean
          source_page: number
          source_question_number?: string | null
          source_reference?: string | null
          source_type?: Database["public"]["Enums"]["question_source_type"] | null
          status?: Database["public"]["Enums"]["question_version_status"]
          stem: string
          version_number: number
        }
        Update: {
          approved_at?: string | null
          calculator_policy?: Database["public"]["Enums"]["question_calculator_policy"] | null
          course_scope?: Database["public"]["Enums"]["question_course_scope"]
          created_at?: string
          created_by?: string
          difficulty?: Database["public"]["Enums"]["question_difficulty"]
          id?: string
          image_url?: string | null
          import_evidence?: NonNullable<Json>
          primary_topic_id?: string
          question_id?: string
          question_type?: Database["public"]["Enums"]["question_type"]
          representation_type?: Database["public"]["Enums"]["question_representation_type"]
          requires_figure?: boolean
          reviewed_by?: string | null
          solution?: string
          source_document?: string
          source_locator?: string | null
          source_locator_verified?: boolean
          source_page?: number
          source_question_number?: string | null
          source_reference?: string | null
          source_type?: Database["public"]["Enums"]["question_source_type"] | null
          status?: Database["public"]["Enums"]["question_version_status"]
          stem?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_versions_primary_topic_id_fkey"
            columns: ["primary_topic_id"]
            isOneToOne: false
            referencedRelation: "curriculum_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_versions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          created_at: string
          created_by: string
          current_version_id: string | null
          external_id: string
          id: string
          status: Database["public"]["Enums"]["question_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          current_version_id?: string | null
          external_id: string
          id?: string
          status?: Database["public"]["Enums"]["question_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          current_version_id?: string | null
          external_id?: string
          id?: string
          status?: Database["public"]["Enums"]["question_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_current_version_belongs_to_question"
            columns: ["current_version_id", "id"]
            isOneToOne: false
            referencedRelation: "question_versions"
            referencedColumns: ["id", "question_id"]
          },
        ]
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
          department: string
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
          department?: string
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
          department?: string
          id?: string
          name?: string
          order_index?: number
          photo_url?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_login_events: {
        Row: {
          id: string
          signed_in_at: string
          user_id: string
        }
        Insert: {
          id?: string
          signed_in_at?: string
          user_id: string
        }
        Update: {
          id?: string
          signed_in_at?: string
          user_id?: string
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
      zombie_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          sentiment: string | null
          used_count: number | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          sentiment?: string | null
          used_count?: number | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          sentiment?: string | null
          used_count?: number | null
        }
        Relationships: []
      }
      zombie_topics: {
        Row: {
          category: string | null
          content: string
          created_at: string
          id: string
          tags: string[] | null
          title: string
          used_count: number | null
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          id?: string
          tags?: string[] | null
          title: string
          used_count?: number | null
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          id?: string
          tags?: string[] | null
          title?: string
          used_count?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      public_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string | null
          id: string | null
          is_zombie: boolean | null
          role: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string | null
          is_zombie?: boolean | null
          role?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string | null
          is_zombie?: boolean | null
          role?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_question_bank_draft: {
        Args: { _question_id: string; _version_id: string }
        Returns: Json
      }
      update_question_bank_draft_metadata: {
        Args: { _question_id: string; _version_id: string; _expected_fingerprint: string; _metadata: Json }
        Returns: string
      }
      delete_question_bank_draft: {
        Args: { _question_id: string; _version_id: string; _expected_fingerprint: string; _delete_question: boolean }
        Returns: Json
      }
      save_question_bank_drafts: {
        Args: { _items: Json }
        Returns: Json
      }
      approve_question_version: {
        Args: { _question_id: string; _version_id: string }
        Returns: Database["public"]["Tables"]["questions"]["Row"]
      }
      create_question_revision: {
        Args: { _question_id: string }
        Returns: string
      }
      count_all_profiles: { Args: never; Returns: number }
      count_real_users: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      retire_question: {
        Args: { _question_id: string }
        Returns: Database["public"]["Tables"]["questions"]["Row"]
      }
      return_question_version_to_draft: {
        Args: { _question_id: string; _version_id: string }
        Returns: string
      }
      submit_question_version_for_review: {
        Args: { _question_id: string; _version_id: string }
        Returns: string
      }
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
      question_calculator_policy:
        | "no_calculator"
        | "calculator_allowed"
        | "calculator_required"
      question_course_scope: "AB" | "BC" | "BOTH"
      question_difficulty: "easy" | "medium" | "hard"
      question_representation_type:
        | "analytical"
        | "graphical"
        | "numerical"
        | "verbal"
        | "mixed"
      question_source_type:
        | "original"
        | "licensed"
        | "public_domain"
        | "permission_granted"
      question_status: "draft" | "approved" | "retired"
      question_type: "mcq_single"
      question_version_status: "draft" | "review" | "approved" | "superseded"
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
      question_calculator_policy: [
        "no_calculator",
        "calculator_allowed",
        "calculator_required",
      ],
      question_course_scope: ["AB", "BC", "BOTH"],
      question_difficulty: ["easy", "medium", "hard"],
      question_representation_type: [
        "analytical",
        "graphical",
        "numerical",
        "verbal",
        "mixed",
      ],
      question_source_type: [
        "original",
        "licensed",
        "public_domain",
        "permission_granted",
      ],
      question_status: ["draft", "approved", "retired"],
      question_type: ["mcq_single"],
      question_version_status: ["draft", "review", "approved", "superseded"],
    },
  },
} as const
