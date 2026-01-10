import { Json } from '@/integrations/supabase/types';

export interface TranscriptEntry {
  s: number; // seconds
  t: string; // text content
}

export interface CourseVideo {
  id: string;
  title: string;
  description: string;
  subtitle?: string;
  video_url: string;
  duration: number;
  order_index: number;
  transcript?: TranscriptEntry[] | null;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  level: string;
  subject: string;
  price: number;
  image_url: string;
  public_profiles: {
    full_name: string;
  };
  course_videos?: CourseVideo[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}
