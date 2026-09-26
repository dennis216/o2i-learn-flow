import { Json } from '@/integrations/supabase/types';

export interface TranscriptEntry {
  s: number; // seconds
  t: string; // text content
}

export interface CourseVideo {
  id: string;
  course_id: string;
  title: string;
  description: string;
  unit?: string;
  subtitle?: string;
  video_url: string;
  duration: number;
  order_index: number;
  transcript?: TranscriptEntry[] | null;
  notes_url?: string | null;
  exam_tips?: string | null;
  playground_url?: string | null;
}

export interface CurriculumTopic {
  id: string;
  topic_code: string;
  title: string;
  big_idea: 'CHA' | 'LIM' | 'FUN';
  is_bc_only: boolean;
  order_index: number;
}

export interface CurriculumUnit {
  id: string;
  unit_number: number;
  title: string;
  is_bc_only: boolean;
  ab_exam_weight_min: number | null;
  ab_exam_weight_max: number | null;
  bc_exam_weight_min: number | null;
  bc_exam_weight_max: number | null;
  curriculum_topics: CurriculumTopic[];
}

export interface CourseCurriculumUnit {
  order_index: number;
  curriculum_units: CurriculumUnit;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  level: string;
  subject: string;
  category: 'High School' | 'Contest';
  price: number;
  image_url: string;
  is_published: boolean;
  public_profiles?: {
    full_name: string;
  } | null;
  course_videos?: CourseVideo[];
  course_curriculum_units?: CourseCurriculumUnit[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}
