import { CURRICULUM_GROUPS, TEAM_DEPARTMENTS, TEAM_ROLES } from "@/lib/teamDepartments";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Play, AlertCircle, CheckCircle, Eye, FileText, Trash2, Pencil, Image, FolderOpen } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MarkdownWithMath from "@/components/MarkdownWithMath";
import { PlaygroundManagement } from "@/components/admin/PlaygroundManagement";
import { UserManagement } from "@/components/admin/UserManagement";
import { SubjectManagement } from "@/components/admin/SubjectManagement";
import { QuestionBankPreview } from "@/components/admin/QuestionBankPreview";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Users, UserCog } from "lucide-react";

interface Course {
  id: string;
  title: string;
  description: string;
  level: string;
  subject: string;
  price: number;
  created_at: string;
  is_published: boolean;
}

interface CourseVideo {
  id: string;
  course_id: string;
  title: string;
  subtitle: string | null;
  video_url: string;
  transcript: any;
  exam_tips: string | null;
  notes_url: string | null;
  order_index: number;
  courses?: { title: string };
}

interface PracticeProblem {
  id: string;
  title: string;
  content: string;
  solution: string | null;
  video_id: string | null;
  image_url: string | null;
  unit_number: number | null;
  lesson_number: string | null;
  created_at: string;
}

interface TeamMember {
  id: string;
  name: string;
  roles: string[];
  bio: string | null;
  photo_url: string | null;
  order_index: number;
  departments: string[];
}

interface Subject {
  id: string;
  name: string;
  category: string;
  icon_url: string | null;
  order_index: number;
}

// Helper to extract YouTube video ID
const getYouTubeVideoId = (url: string): string | null => {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/);
  return match ? match[1] : null;
};

// Helper to get YouTube thumbnail URL
const getYouTubeThumbnail = (videoUrl: string): string => {
  const videoId = getYouTubeVideoId(videoUrl);
  return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : "/placeholder.svg";
};

const Admin = () => {
  const navigate = useNavigate();
  const { user, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [videos, setVideos] = useState<CourseVideo[]>([]);
  const [practiceProblems, setPracticeProblems] = useState<PracticeProblem[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [practiceSubjectFilter, setPracticeSubjectFilter] = useState<string>("");
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    level: "",
    subject: "",
    category: "High School",
    price: "0.00",
    is_published: false,
  });

  // Video upload form
  const [videoFormData, setVideoFormData] = useState({
    course_id: "",
    title: "",
    subtitle: "",
    video_url: "",
    description: "",
    transcript: "",
    exam_tips: "",
    notes_url: "",
    order_index: "0",
  });

  // Practice problem form
  const [practiceFormData, setPracticeFormData] = useState({
    title: "",
    content: "",
    solution: "",
    video_id: "",
    image_url: "",
    unit_number: "",
    lesson_number: "",
  });
  const [practiceImageFile, setPracticeImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Team member form
  const [teamFormData, setTeamFormData] = useState({
    name: "",
    roles: ["Team Member"],
    bio: "",
    departments: [TEAM_DEPARTMENTS[0]],
    order_index: "0",
  });
  const [teamPhotoFile, setTeamPhotoFile] = useState<File | null>(null);
  const [uploadingTeamPhoto, setUploadingTeamPhoto] = useState(false);

  // Edit states
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [editingVideo, setEditingVideo] = useState<CourseVideo | null>(null);
  const [editingProblem, setEditingProblem] = useState<PracticeProblem | null>(null);
  const [editingTeamMember, setEditingTeamMember] = useState<TeamMember | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editVideoDialogOpen, setEditVideoDialogOpen] = useState(false);
  const [editProblemDialogOpen, setEditProblemDialogOpen] = useState(false);
  const [editTeamDialogOpen, setEditTeamDialogOpen] = useState(false);

  // JSON validation state
  const [transcriptValid, setTranscriptValid] = useState<boolean | null>(null);
  const [transcriptError, setTranscriptError] = useState<string>("");

  // AI preview state
  const [aiPreviewOpen, setAiPreviewOpen] = useState(false);
  const [aiPreviewVideo, setAiPreviewVideo] = useState<CourseVideo | null>(null);
  const [aiTestResult, setAiTestResult] = useState<{loading: boolean; error?: string; success?: boolean; response?: string}>({loading: false});

  useEffect(() => {
    checkAdminStatus();
  }, [user]);

  useEffect(() => {
    if (isAdmin) {
      fetchCourses();
      fetchVideos();
      fetchPracticeProblems();
      fetchTeamMembers();
      fetchSubjects();
    }
  }, [isAdmin]);

  // Helper: sanitize transcript JSON to {s, t} format
  const sanitizeTranscript = (rawJson: string): any[] | null => {
    try {
      const parsed = JSON.parse(rawJson);
      if (!Array.isArray(parsed)) return null;
      
      return parsed.map(item => {
        let seconds = item.s ?? item.seconds;
        let text = item.t ?? item.text ?? item.content;
        
        // Handle "00:00:00" format string
        if (typeof item.time === 'string' && item.time.includes(':')) {
          const parts = item.time.split(':').map(Number);
          if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
          else if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
        } else if (item.time !== undefined) {
          seconds = Number(item.time);
        }
        
        return { s: seconds ?? 0, t: text ?? "" };
      });
    } catch (e) {
      return null;
    }
  };

  // Validate JSON when transcript changes
  const [transcriptAutoFormatted, setTranscriptAutoFormatted] = useState(false);

  useEffect(() => {
    const transcript = editingVideo ? (editingVideo.transcript ? JSON.stringify(editingVideo.transcript) : "") : videoFormData.transcript;
    if (!transcript.trim()) {
      setTranscriptValid(null);
      setTranscriptError("");
      setTranscriptAutoFormatted(false);
      return;
    }
    try {
      const parsed = JSON.parse(transcript);
      if (!Array.isArray(parsed)) {
        throw new Error("Transcript must be an array of objects");
      }
      // Check if already in {s, t} format
      const isNativeFormat = parsed.length === 0 || (parsed[0].s !== undefined && parsed[0].t !== undefined);
      // Try sanitize to see if alternative formats work
      const sanitized = sanitizeTranscript(transcript);
      if (!sanitized) {
        throw new Error('Each entry must have "s"/"time"/"seconds" and "t"/"text"/"content"');
      }
      setTranscriptValid(true);
      setTranscriptError("");
      setTranscriptAutoFormatted(!isNativeFormat);
    } catch (err: any) {
      setTranscriptValid(false);
      setTranscriptError(err.message);
      setTranscriptAutoFormatted(false);
    }
  }, [videoFormData.transcript, editingVideo]);

  const checkAdminStatus = async () => {
    if (!user) {
      navigate("/auth");
      return;
    }

    try {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });

      if (error) throw error;

      if (!data) {
        toast({
          title: "Access Denied",
          description: "You don't have admin permissions.",
          variant: "destructive",
        });
        navigate("/");
        return;
      }

      setIsAdmin(true);
    } catch (error) {
      console.error("Error checking admin status:", error);
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const fetchCourses = async () => {
    try {
      const { data, error } = await supabase
        .from("courses")
        .select("id, title, description, level, subject, price, created_at, is_published")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCourses(data || []);
    } catch (error) {
      console.error("Error fetching courses:", error);
    }
  };

  const fetchVideos = async () => {
    try {
      const { data, error } = await supabase
        .from("course_videos")
        .select("id, course_id, title, subtitle, video_url, transcript, exam_tips, notes_url, order_index, courses(title)")
        .order("order_index", { ascending: true });

      if (error) throw error;
      setVideos(data || []);
    } catch (error) {
      console.error("Error fetching videos:", error);
    }
  };

  const fetchPracticeProblems = async () => {
    try {
      const { data, error } = await supabase
        .from("practice_problems")
        .select("id, title, content, solution, video_id, image_url, unit_number, lesson_number, created_at")
        .order("unit_number", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPracticeProblems(data || []);
    } catch (error) {
      console.error("Error fetching practice problems:", error);
    }
  };

  const fetchTeamMembers = async () => {
    try {
      const { data, error } = await supabase
        .from("team_members")
        .select("*")
        .order("order_index", { ascending: true });

      if (error) throw error;
      setTeamMembers(data || []);
    } catch (error) {
      console.error("Error fetching team members:", error);
    }
  };

  const fetchSubjects = async () => {
    try {
      const { data, error } = await supabase
        .from("subjects")
        .select("*")
        .order("category", { ascending: true })
        .order("order_index", { ascending: true });

      if (error) throw error;
      setSubjects(data || []);
    } catch (error) {
      console.error("Error fetching subjects:", error);
    }
  };

  // ===== DELETE FUNCTIONS =====
  const deleteCourse = async (courseId: string) => {
    try {
      const { error } = await supabase.from("courses").delete().eq("id", courseId);
      if (error) throw error;
      toast({ title: "Course deleted successfully" });
      fetchCourses();
      fetchVideos(); // Videos may be affected
    } catch (error: any) {
      console.error("Error deleting course:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const deleteVideo = async (videoId: string) => {
    try {
      const { error } = await supabase.from("course_videos").delete().eq("id", videoId);
      if (error) throw error;
      toast({ title: "Video deleted successfully" });
      fetchVideos();
    } catch (error: any) {
      console.error("Error deleting video:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const deletePracticeProblem = async (problemId: string) => {
    try {
      const { error } = await supabase.from("practice_problems").delete().eq("id", problemId);
      if (error) throw error;
      toast({ title: "Practice problem deleted successfully" });
      fetchPracticeProblems();
    } catch (error: any) {
      console.error("Error deleting practice problem:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const deleteTeamMember = async (memberId: string) => {
    try {
      const { error } = await supabase.from("team_members").delete().eq("id", memberId);
      if (error) throw error;
      toast({ title: "Team member deleted successfully" });
      fetchTeamMembers();
    } catch (error: any) {
      console.error("Error deleting team member:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // ===== UPDATE FUNCTIONS =====
  const updateCourse = async () => {
    if (!editingCourse) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("courses")
        .update({
          title: editingCourse.title,
          description: editingCourse.description,
          level: editingCourse.level,
          subject: editingCourse.subject,
          price: editingCourse.price,
          is_published: editingCourse.is_published,
        })
        .eq("id", editingCourse.id);

      if (error) throw error;
      toast({ title: "Course updated successfully" });
      setEditDialogOpen(false);
      setEditingCourse(null);
      fetchCourses();
    } catch (error: any) {
      console.error("Error updating course:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCoursePublished = async (course: Course) => {
    const nextPublished = !course.is_published;
    setCourses((current) => current.map((item) =>
      item.id === course.id ? { ...item, is_published: nextPublished } : item
    ));

    try {
      const { error } = await supabase
        .from("courses")
        .update({ is_published: nextPublished })
        .eq("id", course.id);

      if (error) throw error;
      toast({
        title: nextPublished ? "Course published" : "Course moved to draft",
        description: nextPublished
          ? `${course.title} is now visible to students.`
          : `${course.title} is now hidden from students.`,
      });
    } catch (error) {
      setCourses((current) => current.map((item) =>
        item.id === course.id ? { ...item, is_published: course.is_published } : item
      ));
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update course visibility.",
        variant: "destructive",
      });
    }
  };

  const updateVideo = async () => {
    if (!editingVideo) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("course_videos")
        .update({
          title: editingVideo.title,
          subtitle: editingVideo.subtitle,
          video_url: editingVideo.video_url,
          transcript: editingVideo.transcript,
          exam_tips: editingVideo.exam_tips,
          notes_url: editingVideo.notes_url,
          order_index: editingVideo.order_index,
        })
        .eq("id", editingVideo.id);

      if (error) throw error;
      toast({ title: "Video updated successfully" });
      setEditVideoDialogOpen(false);
      setEditingVideo(null);
      fetchVideos();
    } catch (error: any) {
      console.error("Error updating video:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const updatePracticeProblem = async () => {
    if (!editingProblem) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("practice_problems")
        .update({
          title: editingProblem.title,
          content: editingProblem.content,
          solution: editingProblem.solution,
          video_id: editingProblem.video_id,
          image_url: editingProblem.image_url,
          unit_number: editingProblem.unit_number,
          lesson_number: editingProblem.lesson_number,
        })
        .eq("id", editingProblem.id);

      if (error) throw error;
      toast({ title: "Practice problem updated successfully" });
      setEditProblemDialogOpen(false);
      setEditingProblem(null);
      fetchPracticeProblems();
    } catch (error: any) {
      console.error("Error updating practice problem:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const updateTeamMember = async () => {
    if (!editingTeamMember) return;
    if (editingTeamMember.roles.length === 0 || editingTeamMember.departments.length === 0) {
      toast({ title: "Role and membership required", description: "Select at least one role and one department or group.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("team_members")
        .update({
          name: editingTeamMember.name,
          roles: editingTeamMember.roles,
          bio: editingTeamMember.bio,
          departments: editingTeamMember.departments,
          photo_url: editingTeamMember.photo_url,
          order_index: editingTeamMember.order_index,
        })
        .eq("id", editingTeamMember.id).select("id").single();

      if (error) throw error;
      await fetchTeamMembers();
      toast({ title: "Team member updated successfully" });
      setEditTeamDialogOpen(false);
      setEditingTeamMember(null);
    } catch (error: any) {
      console.error("Error updating team member:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // ===== IMAGE UPLOAD =====
  const uploadPracticeImage = async (file: File): Promise<string | null> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `practice/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('practice-images')
      .upload(filePath, file);

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return null;
    }

    const { data } = supabase.storage.from('practice-images').getPublicUrl(filePath);
    return data.publicUrl;
  };

  const uploadTeamPhoto = async (file: File): Promise<string | null> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `photos/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('team-photos')
      .upload(filePath, file);

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return null;
    }

    const { data } = supabase.storage.from('team-photos').getPublicUrl(filePath);
    return data.publicUrl;
  };

  // ===== CREATE FUNCTIONS =====
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from("courses").insert({
        title: formData.title,
        description: formData.description,
        level: formData.level,
        subject: formData.subject,
        category: formData.category,
        price: parseFloat(formData.price),
        instructor_id: user.id,
        is_published: formData.is_published,
      });

      if (error) throw error;

      toast({ title: "Success", description: "Course created successfully!" });

      setFormData({
        title: "",
        description: "",
        level: "",
        subject: "",
        category: "High School",
        price: "0.00",
        is_published: false,
      });

      fetchCourses();
    } catch (error) {
      console.error("Error creating course:", error);
      toast({ title: "Error", description: "Failed to create course.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleVideoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !videoFormData.course_id) return;

    if (videoFormData.transcript.trim() && !transcriptValid) {
      toast({ title: "Invalid JSON", description: "Please fix the transcript JSON format.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const insertData: any = {
        course_id: videoFormData.course_id,
        title: videoFormData.title,
        subtitle: videoFormData.subtitle || null,
        video_url: videoFormData.video_url,
        description: videoFormData.description || null,
        order_index: parseInt(videoFormData.order_index) || 0,
        exam_tips: videoFormData.exam_tips || null,
        notes_url: videoFormData.notes_url || null,
      };

      if (videoFormData.transcript.trim()) {
        const sanitized = sanitizeTranscript(videoFormData.transcript);
        if (!sanitized) {
          toast({ title: "Invalid JSON", description: "Could not parse transcript JSON.", variant: "destructive" });
          setSubmitting(false);
          return;
        }
        insertData.transcript = sanitized;
      }

      const { error } = await supabase.from("course_videos").insert(insertData);

      if (error) throw error;

      toast({ title: "Success", description: "Video added successfully!" });

      setVideoFormData({
        course_id: "",
        title: "",
        subtitle: "",
        video_url: "",
        description: "",
        transcript: "",
        exam_tips: "",
        notes_url: "",
        order_index: "0",
      });

      fetchVideos();
    } catch (error: any) {
      console.error("Error adding video:", error);
      toast({ title: "Error", description: error.message || "Failed to add video.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePracticeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);
    setUploadingImage(true);

    try {
      let imageUrl = practiceFormData.image_url;

      // Upload custom image if provided
      if (practiceImageFile) {
        const uploadedUrl = await uploadPracticeImage(practiceImageFile);
        if (uploadedUrl) {
          imageUrl = uploadedUrl;
        }
      } else if (!imageUrl && practiceFormData.video_id) {
        // Use YouTube thumbnail as default
        const video = videos.find(v => v.id === practiceFormData.video_id);
        if (video) {
          imageUrl = getYouTubeThumbnail(video.video_url);
        }
      }

      const { error } = await supabase.from("practice_problems").insert({
        title: practiceFormData.title,
        content: practiceFormData.content,
        solution: practiceFormData.solution || null,
        video_id: practiceFormData.video_id || null,
        image_url: imageUrl || null,
        unit_number: practiceFormData.unit_number ? parseInt(practiceFormData.unit_number) : null,
        lesson_number: practiceFormData.lesson_number || null,
      });

      if (error) throw error;

      toast({ title: "Success", description: "Practice problem created!" });

      setPracticeFormData({
        title: "",
        content: "",
        solution: "",
        video_id: "",
        image_url: "",
        unit_number: "",
        lesson_number: "",
      });
      setPracticeImageFile(null);

      fetchPracticeProblems();
    } catch (error: any) {
      console.error("Error creating practice problem:", error);
      toast({ title: "Error", description: error.message || "Failed to create practice problem.", variant: "destructive" });
    } finally {
      setSubmitting(false);
      setUploadingImage(false);
    }
  };

  const handleTeamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (teamFormData.roles.length === 0 || teamFormData.departments.length === 0) {
      toast({ title: "Role and membership required", description: "Select at least one role and one department or group.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    setUploadingTeamPhoto(true);

    try {
      let photoUrl: string | null = null;

      // Upload photo if provided
      if (teamPhotoFile) {
        photoUrl = await uploadTeamPhoto(teamPhotoFile);
      }

      const { error } = await supabase.from("team_members").insert({
        name: teamFormData.name,
        roles: teamFormData.roles,
        bio: teamFormData.bio || null,
        departments: teamFormData.departments,
        photo_url: photoUrl,
        order_index: parseInt(teamFormData.order_index) || 0,
      });

      if (error) throw error;

      toast({ title: "Success", description: "Team member added!" });

      setTeamFormData({
        name: "",
        roles: ["Team Member"],
        bio: "",
        departments: [TEAM_DEPARTMENTS[0]],
        order_index: "0",
      });
      setTeamPhotoFile(null);

      fetchTeamMembers();
    } catch (error: any) {
      console.error("Error creating team member:", error);
      toast({ title: "Error", description: error.message || "Failed to create team member.", variant: "destructive" });
    } finally {
      setSubmitting(false);
      setUploadingTeamPhoto(false);
    }
  };

  const testAIForVideo = async (video: CourseVideo) => {
    setAiPreviewVideo(video);
    setAiPreviewOpen(true);
    setAiTestResult({ loading: true });

    try {
      const response = await supabase.functions.invoke("ai-tutor", {
        body: {
          message: "Explain what this video is about in one sentence.",
          videoId: video.id,
          currentTime: 0,
        },
      });

      if (response.error) {
        const errorCode = response.error.message?.includes("404") ? "404" : 
                         response.error.message?.includes("500") ? "500" : 
                         response.error.message?.includes("401") ? "401" : "UNKNOWN";
        setAiTestResult({
          loading: false,
          error: `Error ${errorCode}: ${response.error.message}`,
        });
      } else {
        setAiTestResult({
          loading: false,
          success: true,
          response: response.data?.response || "AI responded successfully",
        });
      }
    } catch (err: any) {
      setAiTestResult({
        loading: false,
        error: `Network Error: ${err.message}`,
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  // Get subjects from database filtered by category
  const subjectOptions = subjects.filter(s => s.category === formData.category).map(s => s.name);

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <h1 className="text-4xl font-bold mb-2">Admin Dashboard</h1>
      <p className="text-muted-foreground mb-8">Manage courses, videos, practice problems, and content</p>

      <Tabs defaultValue="videos" className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-5 xl:grid-cols-10">
          <TabsTrigger value="videos">Add Video</TabsTrigger>
          <TabsTrigger value="courses">Create Course</TabsTrigger>
          <TabsTrigger value="practice">Practice</TabsTrigger>
          <TabsTrigger value="question-bank">Question Bank</TabsTrigger>
          <TabsTrigger value="subjects" className="flex items-center gap-1">
            <FolderOpen className="h-4 w-4" />
            Subjects
          </TabsTrigger>
          <TabsTrigger value="playground">Playground</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="manage">Manage Videos</TabsTrigger>
          <TabsTrigger value="manage-courses">Courses</TabsTrigger>
          {isSuperAdmin && (
            <TabsTrigger value="users" className="flex items-center gap-1">
              <UserCog className="h-4 w-4" />
              Users
            </TabsTrigger>
          )}
        </TabsList>

        {/* Add Video Tab */}
        <TabsContent value="videos">
          <div className="grid gap-8 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Add New Video</CardTitle>
                <CardDescription>Upload a video with transcript and exam tips</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleVideoSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="course_id">Associate with Course *</Label>
                    <Select
                      value={videoFormData.course_id}
                      onValueChange={(value) => setVideoFormData({ ...videoFormData, course_id: value })}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a course" />
                      </SelectTrigger>
                      <SelectContent>
                        {courses.map((course) => (
                          <SelectItem key={course.id} value={course.id}>
                            {course.title} ({course.subject})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="video_title">Video Title *</Label>
                      <Input
                        id="video_title"
                        value={videoFormData.title}
                        onChange={(e) => setVideoFormData({ ...videoFormData, title: e.target.value })}
                        placeholder="e.g., Limits Introduction"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="video_subtitle">Unit/Section</Label>
                      <Input
                        id="video_subtitle"
                        value={videoFormData.subtitle}
                        onChange={(e) => setVideoFormData({ ...videoFormData, subtitle: e.target.value })}
                        placeholder="e.g., Unit 1: Limits"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="video_url">YouTube URL *</Label>
                      <Input
                        id="video_url"
                        value={videoFormData.video_url}
                        onChange={(e) => setVideoFormData({ ...videoFormData, video_url: e.target.value })}
                        placeholder="https://youtube.com/watch?v=..."
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="order_index">Order Index</Label>
                      <Input
                        id="order_index"
                        type="number"
                        value={videoFormData.order_index}
                        onChange={(e) => setVideoFormData({ ...videoFormData, order_index: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="video_description">Description</Label>
                    <Textarea
                      id="video_description"
                      value={videoFormData.description}
                      onChange={(e) => setVideoFormData({ ...videoFormData, description: e.target.value })}
                      rows={2}
                      placeholder="Brief description of the video content"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="transcript">Transcript (JSON)</Label>
                      <div className="flex items-center gap-2 text-sm">
                        {transcriptValid === true && (
                          <span className="text-green-600 flex items-center gap-1">
                            <CheckCircle className="h-4 w-4" /> {transcriptAutoFormatted ? 'JSON detected and auto-formatted successfully' : 'Valid JSON'}
                          </span>
                        )}
                        {transcriptValid === false && (
                          <span className="text-destructive flex items-center gap-1">
                            <AlertCircle className="h-4 w-4" /> {transcriptError}
                          </span>
                        )}
                      </div>
                    </div>
                    <Textarea
                      id="transcript"
                      value={videoFormData.transcript}
                      onChange={(e) => setVideoFormData({ ...videoFormData, transcript: e.target.value })}
                      rows={5}
                      placeholder='[{"s": 0, "t": "Introduction to limits..."}, {"s": 30, "t": "When x approaches..."}]'
                      className={`font-mono text-sm ${transcriptValid === false ? 'border-destructive' : ''}`}
                    />
                    <p className="text-xs text-muted-foreground">
                      Format: Array of objects with "s" (seconds) and "t" (text). Used by AI Tutor.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="exam_tips">Exam Tips (Markdown + LaTeX)</Label>
                    <Textarea
                      id="exam_tips"
                      value={videoFormData.exam_tips}
                      onChange={(e) => setVideoFormData({ ...videoFormData, exam_tips: e.target.value })}
                      rows={4}
                      placeholder="Key exam tips... Use $$ for math: $$\lim_{x \to 0} \frac{\sin x}{x} = 1$$"
                    />
                  </div>

                  {videoFormData.exam_tips && (
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">LaTeX Preview:</Label>
                      <div className="p-4 border rounded-lg bg-muted/30">
                        <MarkdownWithMath content={videoFormData.exam_tips} />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="notes_url">Notes/PDF URL</Label>
                    <Input
                      id="notes_url"
                      value={videoFormData.notes_url}
                      onChange={(e) => setVideoFormData({ ...videoFormData, notes_url: e.target.value })}
                      placeholder="https://example.com/notes.pdf"
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Adding Video...
                      </>
                    ) : (
                      "Add Video"
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">JSON Transcript Format</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="p-4 bg-muted rounded-lg text-xs overflow-x-auto">
{`[
  {"s": 0, "t": "Welcome to limits..."},
  {"s": 15, "t": "When x approaches 0..."},
  {"s": 45, "t": "The derivative formula..."}
]`}
                  </pre>
                  <p className="text-sm text-muted-foreground mt-2">
                    • <code>s</code> = seconds (timestamp)
                    <br />
                    • <code>t</code> = transcript text at that time
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">LaTeX Examples</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-mono bg-muted p-2 rounded">$$\lim_&#123;x \to \infty&#125; f(x)$$</p>
                    <MarkdownWithMath content="$$\lim_{x \to \infty} f(x)$$" />
                  </div>
                  <div>
                    <p className="text-sm font-mono bg-muted p-2 rounded">$$\frac&#123;d&#125;&#123;dx&#125;[x^n] = nx^&#123;n-1&#125;$$</p>
                    <MarkdownWithMath content="$$\frac{d}{dx}[x^n] = nx^{n-1}$$" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Create Course Tab */}
        <TabsContent value="courses">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Create New Course</CardTitle>
              <CardDescription>Add a new course to the platform</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={4}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value) => setFormData({ ...formData, category: value, subject: "" })}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="High School">High School</SelectItem>
                        <SelectItem value="Contest">Contest</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject</Label>
                    <Select
                      value={formData.subject}
                      onValueChange={(value) => setFormData({ ...formData, subject: value })}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select subject" />
                      </SelectTrigger>
                      <SelectContent>
                        {subjectOptions.map((subject) => (
                          <SelectItem key={subject} value={subject}>
                            {subject}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="course-published">Publish course</Label>
                    <p className="text-sm text-muted-foreground">
                      Published courses are visible to students. New courses are drafts by default.
                    </p>
                  </div>
                  <Switch
                    id="course-published"
                    checked={formData.is_published}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_published: checked })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="level">Level</Label>
                    <Select
                      value={formData.level}
                      onValueChange={(value) => setFormData({ ...formData, level: value })}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">Beginner</SelectItem>
                        <SelectItem value="intermediate">Intermediate</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="price">Price</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Course"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Practice Problems Tab */}
        <TabsContent value="practice">
          <div className="grid gap-8 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Add Practice Problem</CardTitle>
                <CardDescription>Create a new practice problem linked to a video</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePracticeSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="practice_title">Title *</Label>
                    <Input
                      id="practice_title"
                      value={practiceFormData.title}
                      onChange={(e) => setPracticeFormData({ ...practiceFormData, title: e.target.value })}
                      placeholder="e.g., Limit at Infinity Problem"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="practice_subject">Subject *</Label>
                    <Select
                      value={practiceSubjectFilter}
                      onValueChange={(value) => {
                        setPracticeSubjectFilter(value);
                        // Reset video selection when subject changes
                        setPracticeFormData({ ...practiceFormData, video_id: "" });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a subject first" />
                      </SelectTrigger>
                      <SelectContent>
                        {subjects.length === 0 ? (
                          <SelectItem value="none" disabled>No subjects available</SelectItem>
                        ) : (
                          <>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">High School</div>
                            {subjects.filter(s => s.category === "High School").map((subject) => (
                              <SelectItem key={subject.id} value={subject.name}>
                                {subject.name}
                              </SelectItem>
                            ))}
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Contest</div>
                            {subjects.filter(s => s.category === "Contest").map((subject) => (
                              <SelectItem key={subject.id} value={subject.name}>
                                {subject.name}
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="practice_video">Link to Video</Label>
                    <Select
                      value={practiceFormData.video_id}
                      onValueChange={(value) => setPracticeFormData({ ...practiceFormData, video_id: value })}
                      disabled={!practiceSubjectFilter}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={practiceSubjectFilter ? "Select a video (optional)" : "Select a subject first"} />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          // Filter videos by selected subject via their course
                          const filteredVideos = videos.filter(video => {
                            const course = courses.find(c => c.id === video.course_id);
                            return course && course.subject === practiceSubjectFilter;
                          });
                          
                          if (filteredVideos.length === 0) {
                            return <SelectItem value="none" disabled>No videos for this subject</SelectItem>;
                          }
                          
                          return filteredVideos.map((video) => (
                            <SelectItem key={video.id} value={video.id}>
                              {video.title} {video.subtitle ? `(${video.subtitle})` : ""}
                            </SelectItem>
                          ));
                        })()}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {practiceSubjectFilter 
                        ? "If no image is uploaded, the video thumbnail will be used as default."
                        : "Select a subject above to see available videos."}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="unit_number">Unit Number</Label>
                      <Input
                        id="unit_number"
                        type="number"
                        value={practiceFormData.unit_number}
                        onChange={(e) => setPracticeFormData({ ...practiceFormData, unit_number: e.target.value })}
                        placeholder="e.g., 2"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lesson_number">Lesson Number</Label>
                      <Input
                        id="lesson_number"
                        value={practiceFormData.lesson_number}
                        onChange={(e) => setPracticeFormData({ ...practiceFormData, lesson_number: e.target.value })}
                        placeholder="e.g., 2.1"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="practice_content">Problem Content (Markdown + LaTeX) *</Label>
                    <Textarea
                      id="practice_content"
                      value={practiceFormData.content}
                      onChange={(e) => setPracticeFormData({ ...practiceFormData, content: e.target.value })}
                      rows={4}
                      placeholder="Find $$\lim_{x \to \infty} \frac{3x^2 + 2x}{x^2 - 1}$$"
                      required
                    />
                  </div>

                  {practiceFormData.content && (
                    <div className="p-4 border rounded-lg bg-muted/30">
                      <p className="text-xs text-muted-foreground mb-2">Preview:</p>
                      <MarkdownWithMath content={practiceFormData.content} />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="practice_solution">Solution (Markdown + LaTeX)</Label>
                    <Textarea
                      id="practice_solution"
                      value={practiceFormData.solution}
                      onChange={(e) => setPracticeFormData({ ...practiceFormData, solution: e.target.value })}
                      rows={4}
                      placeholder="Step 1: Divide top and bottom by $$x^2$$..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Problem Diagram (Optional)</Label>
                    <div className="flex items-center gap-4">
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setPracticeImageFile(e.target.files?.[0] || null)}
                        className="flex-1"
                      />
                      {practiceImageFile && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setPracticeImageFile(null)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {practiceImageFile && (
                      <p className="text-xs text-green-600">
                        <CheckCircle className="inline h-3 w-3 mr-1" />
                        {practiceImageFile.name} selected
                      </p>
                    )}
                    {!practiceImageFile && practiceFormData.video_id && (
                      <p className="text-xs text-muted-foreground">
                        <Image className="inline h-3 w-3 mr-1" />
                        Will use video thumbnail as default
                      </p>
                    )}
                  </div>

                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {uploadingImage ? "Uploading Image..." : "Creating..."}
                      </>
                    ) : (
                      "Create Practice Problem"
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Existing Practice Problems</CardTitle>
                <CardDescription>Manage your practice problems</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {practiceProblems.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No practice problems yet</p>
                  ) : (
                    practiceProblems.map((problem) => (
                      <div
                        key={problem.id}
                        className="p-4 border rounded-lg space-y-2 hover:bg-accent/30 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold">{problem.title}</h3>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {problem.content.slice(0, 100)}...
                            </p>
                            {problem.image_url && (
                              <img 
                                src={problem.image_url} 
                                alt="Problem thumbnail"
                                className="w-16 h-12 object-cover rounded mt-2"
                              />
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingProblem(problem);
                                setEditProblemDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm" className="text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Practice Problem?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deletePracticeProblem(problem.id)}>
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="question-bank">
          <QuestionBankPreview />
        </TabsContent>

        {/* Subjects Management Tab */}
        <TabsContent value="subjects">
          <SubjectManagement />
        </TabsContent>

        {/* Manage Videos Tab */}
        <TabsContent value="manage">
          <Card>
            <CardHeader>
              <CardTitle>All Videos</CardTitle>
              <CardDescription>Manage existing videos, edit transcripts, and test AI integration</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[700px] overflow-y-auto">
                {videos.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No videos yet</p>
                ) : (
                  videos.map((video) => (
                    <div
                      key={video.id}
                      className="p-4 border rounded-lg flex items-center justify-between hover:bg-accent/30 transition-colors"
                    >
                      <div className="space-y-1 flex-1">
                        <h3 className="font-semibold">{video.title}</h3>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          <span className="px-2 py-0.5 bg-primary/10 rounded">
                            {video.courses?.title || "No course"}
                          </span>
                          {video.subtitle && (
                            <span className="px-2 py-0.5 bg-muted rounded">{video.subtitle}</span>
                          )}
                          {video.transcript ? (
                            <span className="text-green-600 flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" /> Transcript
                            </span>
                          ) : (
                            <span className="text-amber-600 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" /> No transcript
                            </span>
                          )}
                          {video.exam_tips && (
                            <span className="text-blue-600 flex items-center gap-1">
                              <FileText className="h-3 w-3" /> Tips
                            </span>
                          )}
                          {video.notes_url && (
                            <span className="text-purple-600 flex items-center gap-1">
                              <Eye className="h-3 w-3" /> PDF
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingVideo(video);
                            setEditVideoDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => testAIForVideo(video)}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Test AI
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Video?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete this video and all associated practice problems.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteVideo(video.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Manage Courses Tab */}
        <TabsContent value="manage-courses">
          <Card>
            <CardHeader>
              <CardTitle>All Courses</CardTitle>
              <CardDescription>Edit or delete existing courses</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-h-[700px] overflow-y-auto">
                {courses.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No courses yet</p>
                ) : (
                  courses.map((course) => (
                    <div
                      key={course.id}
                      className="p-4 border rounded-lg flex items-start justify-between hover:bg-accent/30 transition-colors"
                    >
                      <div className="space-y-2 flex-1">
                        <h3 className="font-semibold">{course.title}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {course.description}
                        </p>
                        <div className="flex gap-2 text-xs flex-wrap">
                          <span className="px-2 py-1 bg-primary/10 text-primary rounded">
                            {course.level}
                          </span>
                          <span className="px-2 py-1 bg-secondary text-secondary-foreground rounded">
                            {course.subject}
                          </span>
                          <span className="px-2 py-1 bg-accent text-accent-foreground rounded">
                            ${course.price}
                          </span>
                          <span className="px-2 py-1 bg-muted rounded">
                            {videos.filter(v => v.course_id === course.id).length} videos
                          </span>
                          <span className={`px-2 py-1 rounded font-medium ${
                            course.is_published
                              ? "bg-green-500/10 text-green-700"
                              : "bg-amber-500/10 text-amber-700"
                          }`}>
                            {course.is_published ? "Published" : "Draft"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <div className="flex items-center gap-2 mr-2">
                          <Switch
                            checked={course.is_published}
                            onCheckedChange={() => toggleCoursePublished(course)}
                            aria-label={`${course.is_published ? "Unpublish" : "Publish"} ${course.title}`}
                          />
                          <span className="text-xs text-muted-foreground w-16">
                            {course.is_published ? "Published" : "Draft"}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingCourse(course);
                            setEditDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Course?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete this course. Videos associated with it will remain but will be unlinked.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteCourse(course.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team Management Tab */}
        <TabsContent value="team">
          <div className="grid gap-8 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Add Team Member
                </CardTitle>
                <CardDescription>Add a new team member to display on the team page</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleTeamSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="team_name">Name *</Label>
                    <Input
                      id="team_name"
                      value={teamFormData.name}
                      onChange={(e) => setTeamFormData({ ...teamFormData, name: e.target.value })}
                      placeholder="e.g., John Smith"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Roles *</Label>
                    <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
                      {TEAM_ROLES.map(role => (
                        <label key={role} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={teamFormData.roles.includes(role)}
                            onCheckedChange={(checked) => setTeamFormData({
                              ...teamFormData,
                              roles: checked ? [...teamFormData.roles, role] : teamFormData.roles.filter(value => value !== role),
                            })}
                          />
                          {role}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Departments and Groups *</Label>
                    <div className="space-y-2 rounded-md border p-3">
                      {TEAM_DEPARTMENTS.map(department => (
                        <div key={department} className="space-y-2">
                          <label className="flex items-center gap-2 text-sm font-medium">
                            <Checkbox
                              checked={teamFormData.departments.includes(department)}
                              onCheckedChange={(checked) => setTeamFormData({
                                ...teamFormData,
                                departments: checked ? [...teamFormData.departments, department] : teamFormData.departments.filter(value => value !== department),
                              })}
                            />
                            {department}
                          </label>
                          {department === TEAM_DEPARTMENTS[2] && (
                            <div className="ml-6 grid gap-2 border-l pl-3 sm:grid-cols-2">
                              {CURRICULUM_GROUPS.map(group => (
                                <label key={group} className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Checkbox
                                    checked={teamFormData.departments.includes(group)}
                                    onCheckedChange={(checked) => setTeamFormData({
                                      ...teamFormData,
                                      departments: checked ? [...teamFormData.departments, group] : teamFormData.departments.filter(value => value !== group),
                                    })}
                                  />
                                  {group}
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Groups appear under Curriculum Content &amp; Media Production.</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="team_bio">Bio</Label>
                    <Textarea
                      id="team_bio"
                      value={teamFormData.bio}
                      onChange={(e) => setTeamFormData({ ...teamFormData, bio: e.target.value })}
                      placeholder="A short bio about this team member..."
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="team_order">Display Order</Label>
                    <Input
                      id="team_order"
                      type="number"
                      value={teamFormData.order_index}
                      onChange={(e) => setTeamFormData({ ...teamFormData, order_index: e.target.value })}
                      placeholder="0"
                    />
                    <p className="text-xs text-muted-foreground">Lower numbers appear first</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Profile Photo</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setTeamPhotoFile(e.target.files?.[0] || null)}
                        className="flex-1"
                      />
                      {teamPhotoFile && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setTeamPhotoFile(null)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {teamPhotoFile && (
                      <p className="text-xs text-green-600">
                        <CheckCircle className="inline h-3 w-3 mr-1" />
                        {teamPhotoFile.name} selected
                      </p>
                    )}
                  </div>

                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {uploadingTeamPhoto ? "Uploading Photo..." : "Adding..."}
                      </>
                    ) : (
                      "Add Team Member"
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Existing Team Members</CardTitle>
                <CardDescription>Manage your team members</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {teamMembers.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No team members yet</p>
                  ) : (
                    teamMembers.map((member) => (
                      <div
                        key={member.id}
                        className="p-4 border rounded-lg flex items-center gap-4 hover:bg-accent/30 transition-colors"
                      >
                        <div className="w-16 h-16 rounded-full overflow-hidden bg-muted flex-shrink-0">
                          {member.photo_url ? (
                            <img
                              src={member.photo_url}
                              alt={member.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-muted-foreground">
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold truncate">{member.name}</h3>
                          <p className="text-sm text-primary">{member.roles.join(" · ")}</p>
                          <p className="text-xs font-medium" style={{ color: '#4A90E2' }}>Memberships: {member.departments.join(", ")}</p>
                          {member.bio && (
                            <p className="text-sm text-muted-foreground line-clamp-1">{member.bio}</p>
                          )}
                          <span className="text-xs text-muted-foreground">Order: {member.order_index}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={"Edit team member " + member.name}
                            onClick={() => {
                              setEditingTeamMember(member);
                              setEditTeamDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm" className="text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Team Member?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteTeamMember(member.id)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Playground Management Tab */}
        <TabsContent value="playground">
          <PlaygroundManagement />
        </TabsContent>

        {/* User Management Tab - Super Admin Only */}
        {isSuperAdmin && (
          <TabsContent value="users">
            <UserManagement />
          </TabsContent>
        )}
      </Tabs>

      {/* Edit Course Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Course</DialogTitle>
            <DialogDescription>Update course details</DialogDescription>
          </DialogHeader>
          {editingCourse && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={editingCourse.title}
                  onChange={(e) => setEditingCourse({ ...editingCourse, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editingCourse.description}
                  onChange={(e) => setEditingCourse({ ...editingCourse, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Level</Label>
                  <Select
                    value={editingCourse.level}
                    onValueChange={(value) => setEditingCourse({ ...editingCourse, level: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="beginner">Beginner</SelectItem>
                      <SelectItem value="intermediate">Intermediate</SelectItem>
                      <SelectItem value="advanced">Advanced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Price</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editingCourse.price}
                    onChange={(e) => setEditingCourse({ ...editingCourse, price: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <Label htmlFor="edit-course-published">Published</Label>
                  <p className="text-sm text-muted-foreground">Visible to students and signed-out visitors.</p>
                </div>
                <Switch
                  id="edit-course-published"
                  checked={editingCourse.is_published}
                  onCheckedChange={(checked) => setEditingCourse({ ...editingCourse, is_published: checked })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={updateCourse} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Video Dialog */}
      <Dialog open={editVideoDialogOpen} onOpenChange={setEditVideoDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Video</DialogTitle>
            <DialogDescription>Update video details, transcript, and PDF links</DialogDescription>
          </DialogHeader>
          {editingVideo && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input
                    value={editingVideo.title}
                    onChange={(e) => setEditingVideo({ ...editingVideo, title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Subtitle/Unit</Label>
                  <Input
                    value={editingVideo.subtitle || ""}
                    onChange={(e) => setEditingVideo({ ...editingVideo, subtitle: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Video URL</Label>
                  <Input
                    value={editingVideo.video_url}
                    onChange={(e) => setEditingVideo({ ...editingVideo, video_url: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Order Index</Label>
                  <Input
                    type="number"
                    value={editingVideo.order_index}
                    onChange={(e) => setEditingVideo({ ...editingVideo, order_index: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes/PDF URL</Label>
                <Input
                  value={editingVideo.notes_url || ""}
                  onChange={(e) => setEditingVideo({ ...editingVideo, notes_url: e.target.value })}
                  placeholder="https://example.com/notes.pdf"
                />
              </div>
              <div className="space-y-2">
                <Label>Transcript (JSON)</Label>
                <Textarea
                  value={editingVideo.transcript ? JSON.stringify(editingVideo.transcript, null, 2) : ""}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      setEditingVideo({ ...editingVideo, transcript: parsed });
                    } catch {
                      // Keep the raw string temporarily
                    }
                  }}
                  rows={6}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Exam Tips (Markdown + LaTeX)</Label>
                <Textarea
                  value={editingVideo.exam_tips || ""}
                  onChange={(e) => setEditingVideo({ ...editingVideo, exam_tips: e.target.value })}
                  rows={4}
                />
              </div>
              {editingVideo.exam_tips && (
                <div className="p-4 border rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-2">Preview:</p>
                  <MarkdownWithMath content={editingVideo.exam_tips} />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditVideoDialogOpen(false)}>Cancel</Button>
            <Button onClick={updateVideo} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Practice Problem Dialog */}
      <Dialog open={editProblemDialogOpen} onOpenChange={setEditProblemDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Practice Problem</DialogTitle>
            <DialogDescription>Update problem content, solution, and image</DialogDescription>
          </DialogHeader>
          {editingProblem && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={editingProblem.title}
                  onChange={(e) => setEditingProblem({ ...editingProblem, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Link to Video</Label>
                <Select
                  value={editingProblem.video_id || ""}
                  onValueChange={(value) => setEditingProblem({ ...editingProblem, video_id: value || null })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a video" />
                  </SelectTrigger>
                  <SelectContent>
                    {videos.map((video) => (
                      <SelectItem key={video.id} value={video.id}>
                        {video.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Problem Content</Label>
                <Textarea
                  value={editingProblem.content}
                  onChange={(e) => setEditingProblem({ ...editingProblem, content: e.target.value })}
                  rows={4}
                />
              </div>
              {editingProblem.content && (
                <div className="p-4 border rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-2">Preview:</p>
                  <MarkdownWithMath content={editingProblem.content} />
                </div>
              )}
              <div className="space-y-2">
                <Label>Solution</Label>
                <Textarea
                  value={editingProblem.solution || ""}
                  onChange={(e) => setEditingProblem({ ...editingProblem, solution: e.target.value })}
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label>Image URL</Label>
                <Input
                  value={editingProblem.image_url || ""}
                  onChange={(e) => setEditingProblem({ ...editingProblem, image_url: e.target.value })}
                  placeholder="https://..."
                />
                {editingProblem.image_url && (
                  <div className="flex items-center gap-4">
                    <img 
                      src={editingProblem.image_url} 
                      alt="Preview" 
                      className="w-24 h-16 object-cover rounded"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingProblem({ ...editingProblem, image_url: null })}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProblemDialogOpen(false)}>Cancel</Button>
            <Button onClick={updatePracticeProblem} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Test Dialog */}
      <Dialog open={aiPreviewOpen} onOpenChange={setAiPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>AI Tutor Test: {aiPreviewVideo?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {aiTestResult.loading && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Testing AI connection...
              </div>
            )}
            {aiTestResult.error && (
              <div className="p-4 bg-destructive/10 border border-destructive rounded-lg">
                <p className="text-destructive font-mono text-sm">{aiTestResult.error}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Check edge function deployment and logs for details.
                </p>
              </div>
            )}
            {aiTestResult.success && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  AI Connected Successfully
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-2">AI Response:</p>
                  <MarkdownWithMath content={aiTestResult.response || ""} />
                </div>
              </div>
            )}
            {aiPreviewVideo?.transcript && (
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium mb-2">Transcript Preview:</p>
                <pre className="text-xs overflow-x-auto">
                  {JSON.stringify(aiPreviewVideo.transcript, null, 2).slice(0, 500)}...
                </pre>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Team Member Dialog */}
      <Dialog open={editTeamDialogOpen} onOpenChange={setEditTeamDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Team Member</DialogTitle>
            <DialogDescription>Update team member details</DialogDescription>
          </DialogHeader>
          {editingTeamMember && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={editingTeamMember.name}
                  onChange={(e) => setEditingTeamMember({ ...editingTeamMember, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Roles</Label>
                <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
                  {TEAM_ROLES.map(role => (
                    <label key={role} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={editingTeamMember.roles.includes(role)}
                        onCheckedChange={(checked) => setEditingTeamMember({
                          ...editingTeamMember,
                          roles: checked ? [...editingTeamMember.roles, role] : editingTeamMember.roles.filter(value => value !== role),
                        })}
                      />
                      {role}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Departments and Groups</Label>
                <div className="max-h-52 space-y-2 overflow-y-auto rounded-md border p-3">
                  {TEAM_DEPARTMENTS.map(department => (
                    <div key={department} className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <Checkbox
                          checked={editingTeamMember.departments.includes(department)}
                          onCheckedChange={(checked) => setEditingTeamMember({
                            ...editingTeamMember,
                            departments: checked ? [...editingTeamMember.departments, department] : editingTeamMember.departments.filter(value => value !== department),
                          })}
                        />
                        {department}
                      </label>
                      {department === TEAM_DEPARTMENTS[2] && (
                        <div className="ml-6 grid gap-2 border-l pl-3 sm:grid-cols-2">
                          {CURRICULUM_GROUPS.map(group => (
                            <label key={group} className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Checkbox
                                checked={editingTeamMember.departments.includes(group)}
                                onCheckedChange={(checked) => setEditingTeamMember({
                                  ...editingTeamMember,
                                  departments: checked ? [...editingTeamMember.departments, group] : editingTeamMember.departments.filter(value => value !== group),
                                })}
                              />
                              {group}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Bio</Label>
                <Textarea
                  value={editingTeamMember.bio || ""}
                  onChange={(e) => setEditingTeamMember({ ...editingTeamMember, bio: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Photo URL</Label>
                <Input
                  value={editingTeamMember.photo_url || ""}
                  onChange={(e) => setEditingTeamMember({ ...editingTeamMember, photo_url: e.target.value })}
                  placeholder="https://..."
                />
                {editingTeamMember.photo_url && (
                  <img src={editingTeamMember.photo_url} alt="Preview" className="w-16 h-16 rounded-full object-cover" />
                )}
              </div>
              <div className="space-y-2">
                <Label>Order Index</Label>
                <Input
                  type="number"
                  value={editingTeamMember.order_index}
                  onChange={(e) => setEditingTeamMember({ ...editingTeamMember, order_index: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTeamDialogOpen(false)}>Cancel</Button>
            <Button onClick={updateTeamMember} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default Admin;
