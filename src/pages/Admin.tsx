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
import { useToast } from "@/hooks/use-toast";
import { Loader2, Play, AlertCircle, CheckCircle, Eye, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MarkdownWithMath from "@/components/MarkdownWithMath";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface Course {
  id: string;
  title: string;
  description: string;
  level: string;
  subject: string;
  price: number;
  created_at: string;
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

const Admin = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [videos, setVideos] = useState<CourseVideo[]>([]);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    level: "",
    subject: "",
    price: "0.00",
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
    }
  }, [isAdmin]);

  // Validate JSON when transcript changes
  useEffect(() => {
    if (!videoFormData.transcript.trim()) {
      setTranscriptValid(null);
      setTranscriptError("");
      return;
    }
    try {
      const parsed = JSON.parse(videoFormData.transcript);
      if (!Array.isArray(parsed)) {
        throw new Error("Transcript must be an array of objects");
      }
      if (parsed.length > 0 && (!parsed[0].s || !parsed[0].t)) {
        throw new Error('Each entry must have "s" (seconds) and "t" (text)');
      }
      setTranscriptValid(true);
      setTranscriptError("");
    } catch (err: any) {
      setTranscriptValid(false);
      setTranscriptError(err.message);
    }
  }, [videoFormData.transcript]);

  const checkAdminStatus = async () => {
    if (!user) {
      navigate("/auth");
      return;
    }

    try {
      // Use has_role RPC function - not hardcoded email
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
        .select("id, title, description, level, subject, price, created_at")
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
        price: parseFloat(formData.price),
        instructor_id: user.id,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Course created successfully!",
      });

      setFormData({
        title: "",
        description: "",
        level: "",
        subject: "",
        price: "0.00",
      });

      fetchCourses();
    } catch (error) {
      console.error("Error creating course:", error);
      toast({
        title: "Error",
        description: "Failed to create course.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleVideoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !videoFormData.course_id) return;

    // Validate transcript JSON if provided
    if (videoFormData.transcript.trim() && !transcriptValid) {
      toast({
        title: "Invalid JSON",
        description: "Please fix the transcript JSON format.",
        variant: "destructive",
      });
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
        insertData.transcript = JSON.parse(videoFormData.transcript);
      }

      const { error } = await supabase.from("course_videos").insert(insertData);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Video added successfully!",
      });

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
      toast({
        title: "Error",
        description: error.message || "Failed to add video.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
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

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <h1 className="text-4xl font-bold mb-2">Admin Dashboard</h1>
      <p className="text-muted-foreground mb-8">Manage courses, videos, and content</p>

      <Tabs defaultValue="videos" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="videos">Add Video</TabsTrigger>
          <TabsTrigger value="courses">Create Course</TabsTrigger>
          <TabsTrigger value="manage">Manage Videos</TabsTrigger>
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
                  {/* Course Selection - Dynamic from database */}
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

                  {/* Transcript JSON Input */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="transcript">Transcript (JSON)</Label>
                      <div className="flex items-center gap-2 text-sm">
                        {transcriptValid === true && (
                          <span className="text-green-600 flex items-center gap-1">
                            <CheckCircle className="h-4 w-4" /> Valid JSON
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

                  {/* Exam Tips with LaTeX Preview */}
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

                  {/* LaTeX Preview */}
                  {videoFormData.exam_tips && (
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">LaTeX Preview:</Label>
                      <div className="p-4 border rounded-lg bg-muted/30">
                        <MarkdownWithMath content={videoFormData.exam_tips} />
                      </div>
                    </div>
                  )}

                  {/* Notes/PDF URL */}
                  <div className="space-y-2">
                    <Label htmlFor="notes_url">Notes/PDF URL</Label>
                    <Input
                      id="notes_url"
                      value={videoFormData.notes_url}
                      onChange={(e) => setVideoFormData({ ...videoFormData, notes_url: e.target.value })}
                      placeholder="https://example.com/notes.pdf"
                    />
                    <p className="text-xs text-muted-foreground">
                      Link to PDF notes or supplementary materials
                    </p>
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

            {/* Quick Reference */}
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
          <div className="grid gap-8 md:grid-cols-2">
            <Card>
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
                    <Label htmlFor="subject">Subject / Course Type</Label>
                    <Select
                      value={formData.subject}
                      onValueChange={(value) => setFormData({ ...formData, subject: value })}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select subject" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AP Calculus">AP Calculus</SelectItem>
                        <SelectItem value="Pre-Calc 12">Pre-Calc 12</SelectItem>
                        <SelectItem value="Pre-Calc 11">Pre-Calc 11</SelectItem>
                        <SelectItem value="Pre-Calc 10">Pre-Calc 10</SelectItem>
                        <SelectItem value="mathematics">Mathematics (General)</SelectItem>
                        <SelectItem value="algebra">Algebra</SelectItem>
                        <SelectItem value="geometry">Geometry</SelectItem>
                        <SelectItem value="statistics">Statistics</SelectItem>
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

            <Card>
              <CardHeader>
                <CardTitle>Existing Courses</CardTitle>
                <CardDescription>All courses on the platform</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {courses.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No courses yet</p>
                  ) : (
                    courses.map((course) => (
                      <div
                        key={course.id}
                        className="p-4 border rounded-lg space-y-2 hover:bg-accent/50 transition-colors"
                      >
                        <h3 className="font-semibold">{course.title}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {course.description}
                        </p>
                        <div className="flex gap-2 text-xs">
                          <span className="px-2 py-1 bg-primary/10 text-primary rounded">
                            {course.level}
                          </span>
                          <span className="px-2 py-1 bg-secondary text-secondary-foreground rounded">
                            {course.subject}
                          </span>
                          <span className="px-2 py-1 bg-accent text-accent-foreground rounded">
                            ${course.price}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">ID: {course.id}</p>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Manage Videos Tab */}
        <TabsContent value="manage">
          <Card>
            <CardHeader>
              <CardTitle>All Videos</CardTitle>
              <CardDescription>Manage existing videos and test AI integration</CardDescription>
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
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => testAIForVideo(video)}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Test AI
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

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
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Admin;