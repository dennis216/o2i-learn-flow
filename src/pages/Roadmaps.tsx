import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, ChevronDown, ChevronRight, BookOpen, Video, Brain, Target } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface Roadmap {
  id: string;
  title: string;
  description: string;
  created_at: string;
}

interface Chapter {
  id: string;
  roadmap_id: string;
  title: string;
  description: string;
  order_index: number;
}

interface SubChapter {
  id: string;
  chapter_id: string;
  title: string;
  description: string;
  order_index: number;
}

const Roadmaps = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  const [selectedRoadmap, setSelectedRoadmap] = useState<string | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [subChapters, setSubChapters] = useState<SubChapter[]>([]);
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [showCreateRoadmap, setShowCreateRoadmap] = useState(false);
  const [showCreateChapter, setShowCreateChapter] = useState(false);
  const [newRoadmapTitle, setNewRoadmapTitle] = useState("");
  const [newRoadmapDescription, setNewRoadmapDescription] = useState("");
  const [newChapterTitle, setNewChapterTitle] = useState("");
  const [newChapterDescription, setNewChapterDescription] = useState("");

  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    fetchRoadmaps();
  }, []);

  useEffect(() => {
    if (selectedRoadmap) {
      fetchChapters(selectedRoadmap);
    }
  }, [selectedRoadmap]);

  useEffect(() => {
    if (chapters.length > 0) {
      fetchSubChapters();
    }
  }, [chapters]);

  const fetchRoadmaps = async () => {
    try {
      const { data, error } = await supabase
        .from("roadmaps")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) throw error;
      setRoadmaps(data || []);
    } catch (error) {
      console.error("Error fetching roadmaps:", error);
      toast({
        title: "Error",
        description: "Failed to fetch roadmaps",
        variant: "destructive",
      });
    }
  };

  const fetchChapters = async (roadmapId: string) => {
    try {
      const { data, error } = await supabase
        .from("chapters")
        .select("*")
        .eq("roadmap_id", roadmapId)
        .order("order_index", { ascending: true });

      if (error) throw error;
      setChapters(data || []);
    } catch (error) {
      console.error("Error fetching chapters:", error);
      toast({
        title: "Error",
        description: "Failed to fetch chapters",
        variant: "destructive",
      });
    }
  };

  const fetchSubChapters = async () => {
    try {
      const chapterIds = chapters.map(c => c.id);
      const { data, error } = await supabase
        .from("sub_chapters")
        .select("*")
        .in("chapter_id", chapterIds)
        .order("order_index", { ascending: true });

      if (error) throw error;
      setSubChapters(data || []);
    } catch (error) {
      console.error("Error fetching sub-chapters:", error);
      toast({
        title: "Error",
        description: "Failed to fetch sub-chapters",
        variant: "destructive",
      });
    }
  };

  const createRoadmap = async () => {
    if (!newRoadmapTitle.trim()) return;

    try {
      const { data, error } = await supabase
        .from("roadmaps")
        .insert([
          {
            title: newRoadmapTitle,
            description: newRoadmapDescription,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      setRoadmaps([...roadmaps, data]);
      setNewRoadmapTitle("");
      setNewRoadmapDescription("");
      setShowCreateRoadmap(false);
      toast({
        title: "Success",
        description: "Roadmap created successfully",
      });
    } catch (error) {
      console.error("Error creating roadmap:", error);
      toast({
        title: "Error",
        description: "Failed to create roadmap",
        variant: "destructive",
      });
    }
  };

  const createChapter = async () => {
    if (!newChapterTitle.trim() || !selectedRoadmap) return;

    try {
      const { data, error } = await supabase
        .from("chapters")
        .insert([
          {
            roadmap_id: selectedRoadmap,
            title: newChapterTitle,
            description: newChapterDescription,
            order_index: chapters.length,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      setChapters([...chapters, data]);
      setNewChapterTitle("");
      setNewChapterDescription("");
      setShowCreateChapter(false);
      toast({
        title: "Success",
        description: "Chapter created successfully",
      });
    } catch (error) {
      console.error("Error creating chapter:", error);
      toast({
        title: "Error",
        description: "Failed to create chapter",
        variant: "destructive",
      });
    }
  };

  const toggleChapter = (chapterId: string) => {
    const newExpanded = new Set(expandedChapters);
    if (newExpanded.has(chapterId)) {
      newExpanded.delete(chapterId);
    } else {
      newExpanded.add(chapterId);
    }
    setExpandedChapters(newExpanded);
  };

  const getSubChaptersForChapter = (chapterId: string) => {
    return subChapters.filter(sc => sc.chapter_id === chapterId);
  };

  if (!selectedRoadmap) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Learning Roadmaps
              </h1>
              <p className="text-muted-foreground mt-2">
                Choose your path to mathematical excellence
              </p>
            </div>
            {isAdmin && (
              <Dialog open={showCreateRoadmap} onOpenChange={setShowCreateRoadmap}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Roadmap
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Roadmap</DialogTitle>
                    <DialogDescription>
                      Add a new learning roadmap for students to follow.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="title">Title</Label>
                      <Input
                        id="title"
                        value={newRoadmapTitle}
                        onChange={(e) => setNewRoadmapTitle(e.target.value)}
                        placeholder="e.g., Qualify for AIME through AMC 10"
                      />
                    </div>
                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={newRoadmapDescription}
                        onChange={(e) => setNewRoadmapDescription(e.target.value)}
                        placeholder="Describe the roadmap objectives..."
                      />
                    </div>
                    <Button onClick={createRoadmap} className="w-full">
                      Create Roadmap
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {roadmaps.map((roadmap) => (
              <Card
                key={roadmap.id}
                className="cursor-pointer hover:shadow-lg transition-all duration-200 border-2 hover:border-primary/50"
                onClick={() => setSelectedRoadmap(roadmap.id)}
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    {roadmap.title}
                  </CardTitle>
                  <CardDescription>{roadmap.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">
                    Start Learning
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {roadmaps.length === 0 && (
            <div className="text-center py-12">
              <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-muted-foreground">No roadmaps available</h3>
              <p className="text-muted-foreground">
                {isAdmin ? "Create your first roadmap to get started." : "Check back later for new roadmaps."}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const currentRoadmap = roadmaps.find(r => r.id === selectedRoadmap);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <Button
              variant="ghost"
              onClick={() => setSelectedRoadmap(null)}
              className="mb-4"
            >
              ← Back to Roadmaps
            </Button>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              {currentRoadmap?.title}
            </h1>
            <p className="text-muted-foreground mt-2">
              {currentRoadmap?.description}
            </p>
          </div>
          {isAdmin && (
            <Dialog open={showCreateChapter} onOpenChange={setShowCreateChapter}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Chapter
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Chapter</DialogTitle>
                  <DialogDescription>
                    Add a new chapter to this roadmap.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="chapter-title">Title</Label>
                    <Input
                      id="chapter-title"
                      value={newChapterTitle}
                      onChange={(e) => setNewChapterTitle(e.target.value)}
                      placeholder="e.g., Triangle Geometry"
                    />
                  </div>
                  <div>
                    <Label htmlFor="chapter-description">Description</Label>
                    <Textarea
                      id="chapter-description"
                      value={newChapterDescription}
                      onChange={(e) => setNewChapterDescription(e.target.value)}
                      placeholder="Describe the chapter content..."
                    />
                  </div>
                  <Button onClick={createChapter} className="w-full">
                    Create Chapter
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="space-y-4">
          {chapters.map((chapter) => {
            const chapterSubChapters = getSubChaptersForChapter(chapter.id);
            const isExpanded = expandedChapters.has(chapter.id);

            return (
              <Card key={chapter.id} className="overflow-hidden">
                <Collapsible>
                  <CollapsibleTrigger
                    className="w-full"
                    onClick={() => toggleChapter(chapter.id)}
                  >
                    <CardHeader className="hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="h-5 w-5" />
                          ) : (
                            <ChevronRight className="h-5 w-5" />
                          )}
                          <BookOpen className="h-5 w-5 text-primary" />
                          <div className="text-left">
                            <CardTitle>{chapter.title}</CardTitle>
                            <CardDescription>{chapter.description}</CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{chapterSubChapters.length} sub-chapters</span>
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <div className="space-y-3 ml-8">
                        {chapterSubChapters.map((subChapter) => (
                          <div
                            key={subChapter.id}
                            className="p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="font-medium">{subChapter.title}</h4>
                                <p className="text-sm text-muted-foreground">
                                  {subChapter.description}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Brain className="h-4 w-4 text-blue-500" />
                                <Video className="h-4 w-4 text-green-500" />
                                <Target className="h-4 w-4 text-purple-500" />
                              </div>
                            </div>
                          </div>
                        ))}
                        {chapterSubChapters.length === 0 && (
                          <div className="text-center py-8 text-muted-foreground">
                            <p>No sub-chapters yet.</p>
                            {isAdmin && (
                              <p className="text-sm mt-2">
                                Add sub-chapters to organize the content.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>

        {chapters.length === 0 && (
          <div className="text-center py-12">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-muted-foreground">No chapters available</h3>
            <p className="text-muted-foreground">
              {isAdmin ? "Add the first chapter to get started." : "Check back later for new content."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Roadmaps;