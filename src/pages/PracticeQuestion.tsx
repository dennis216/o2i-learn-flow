import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, Play, Sparkles, Bot, Loader2, ChevronDown, ChevronUp, Lightbulb, Wand2, MessageCircle } from 'lucide-react';
import { TranscriptEntry } from '@/components/courses/types';
import MarkdownWithMath from '@/components/MarkdownWithMath';
import { AITutorDrawer } from '@/components/courses/AITutorDrawer';
interface VideoData {
  id: string;
  title: string;
  subtitle: string | null;
  video_url: string;
  transcript: TranscriptEntry[] | null;
  course_id: string;
}

interface GeneratedQuestion {
  question: string;
  topic: string;
  solution?: string;
}

interface PracticeProblemData {
  id: string;
  title: string;
  content: string;
  solution: string | null;
  video_id: string | null;
  lesson_number: string | null;
  unit_number: number | null;
}

const SUPABASE_URL = 'https://lxoaeaewcrshjkigzyqe.supabase.co';

// Extract YouTube video ID from various YouTube URL formats
const extractYouTubeId = (url: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/, // Direct ID
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

export default function PracticeQuestion() {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const [video, setVideo] = useState<VideoData | null>(null);
  const [practiceProblems, setPracticeProblems] = useState<PracticeProblemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatedQuestion, setGeneratedQuestion] = useState<GeneratedQuestion | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [solutionVisibility, setSolutionVisibility] = useState<Record<string, boolean>>({});
  const [generatingSolutionForId, setGeneratingSolutionForId] = useState<string | null>(null);
  const [generatedSolutions, setGeneratedSolutions] = useState<Record<string, string>>({});
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerContext, setDrawerContext] = useState({ explanation: '', timestamp: '' });

  useEffect(() => {
    const fetchVideoAndProblems = async () => {
      if (!videoId) return;

      try {
        // Fetch video data
        const { data: videoData, error: videoError } = await supabase
          .from('course_videos')
          .select('id, title, subtitle, video_url, transcript, course_id')
          .eq('id', videoId)
          .single();

        if (videoError) {
          console.error('Error fetching video:', videoError);
        } else if (videoData) {
          setVideo({
            ...videoData,
            transcript: videoData.transcript as unknown as TranscriptEntry[] | null,
          });
        }

        // Fetch ALL practice problems linked to this video
        const { data: problemsData, error: problemsError } = await supabase
          .from('practice_problems')
          .select('id, title, content, solution, video_id, lesson_number, unit_number')
          .eq('video_id', videoId)
          .order('lesson_number', { ascending: true });

        if (problemsError) {
          console.error('Error fetching practice problems:', problemsError);
        } else if (problemsData) {
          setPracticeProblems(problemsData as PracticeProblemData[]);
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchVideoAndProblems();
  }, [videoId]);

  const handleGenerateQuestion = async () => {
    if (!video?.transcript || video.transcript.length === 0) {
      // Still generate question even without transcript, AI can use title
      console.log('No transcript available, generating based on title');
    }

    setIsGenerating(true);
    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.error('Authentication required');
        setIsGenerating(false);
        return;
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-practice-question`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          transcript: video.transcript,
          videoTitle: video.title,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.error('Authentication required');
          return;
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate question');
      }

      const data = await response.json();
      setGeneratedQuestion({
        question: data.question,
        topic: data.topic || video.title,
        solution: data.solution,
      });
    } catch (error) {
      console.error('Error generating question:', error);
      // Silent error - log to console instead of disruptive toast
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAskAITutor = () => {
    if (generatedQuestion) {
      // Navigate to AI Tutor with the generated question as a pre-filled message
      navigate('/ai-tutor', { 
        state: { 
          prefilledQuestion: generatedQuestion.question,
          topic: generatedQuestion.topic,
          fromPractice: true,
        } 
      });
    }
  };

  // Generate AI solution for problems without a stored solution
  const handleGenerateSolution = async (problemId: string, problemContent: string) => {
    setGeneratingSolutionForId(problemId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.error('Authentication required');
        setGeneratingSolutionForId(null);
        return;
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-tutor-standalone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          message: `Please provide a detailed step-by-step solution for this problem. Format your answer clearly with "Step 1:", "Step 2:", etc. Use proper LaTeX formatting for all math expressions.\n\nProblem:\n${problemContent}`,
          selectedTopic: 'general',
          videoContext: video ? {
            title: video.title,
            subject: 'math',
          } : null,
          conversationHistory: [],
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate solution');
      }

      if (!response.body) {
        throw new Error('No response stream available');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullSolution = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              fullSolution += content;
              setGeneratedSolutions(prev => ({ ...prev, [problemId]: fullSolution }));
            }
          } catch { /* ignore incomplete JSON */ }
        }
      }
    } catch (error) {
      console.error('Error generating solution:', error);
      setGeneratedSolutions(prev => ({ ...prev, [problemId]: 'Sorry, there was an error generating the solution. Please try again.' }));
    } finally {
      setGeneratingSolutionForId(null);
    }
  };

  // Open AI Tutor Drawer with problem context
  const handleAskTutorForSolution = (problemTitle: string, problemContent: string) => {
    const lessonLabel = video?.title || 'this lesson';
    const explanation = `Hi! I'm stuck on ${lessonLabel}. Can you explain the solution for this question?\n\nProblem: "${problemTitle}"\n\n${problemContent}\n\nPlease provide a detailed step-by-step guide.`;
    setDrawerContext({
      explanation,
      timestamp: 'Practice Problem',
    });
    setIsDrawerOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <Skeleton className="h-8 w-32 mb-8" />
          <Skeleton className="aspect-video w-full mb-8" />
          <Skeleton className="h-10 w-48" />
        </div>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-4">Lesson not found</h2>
          <Button asChild>
            <Link to="/practice">Back to Practice</Link>
          </Button>
        </div>
      </div>
    );
  }

  const youtubeId = extractYouTubeId(video.video_url);
  const thumbnailUrl = youtubeId 
    ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
    : '/placeholder.svg';

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Back Button */}
        <Button variant="ghost" asChild className="mb-6">
          <Link to="/practice">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Practice
          </Link>
        </Button>

        {/* Header */}
        <div className="mb-8">
          {video.subtitle && (
            <p className="text-sm text-muted-foreground mb-2">{video.subtitle}</p>
          )}
          <h1 className="text-3xl font-bold text-foreground">{video.title}</h1>
        </div>

        {/* Problem Image (YouTube Thumbnail) */}
        <Card className="mb-8 overflow-hidden">
          <div className="aspect-video relative">
            <img
              src={thumbnailUrl}
              alt={video.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/placeholder.svg';
              }}
            />
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <Button asChild size="lg" className="flex-1">
            <Link to={`/courses?video=${video.id}&autoplay=true`}>
              <Play className="h-5 w-5 mr-2" />
              Go to Solution (Video Lesson)
            </Link>
          </Button>
        </div>

        {/* Database Practice Problems Section - Multiple problems with sequential numbering */}
        {practiceProblems.length > 0 && (
          <div className="space-y-6 mb-8">
            <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" />
              Practice Problems ({practiceProblems.length})
            </h2>
            
            {practiceProblems.map((problem, index) => {
              const isVisible = solutionVisibility[problem.id] || false;
              const isGenerating = generatingSolutionForId === problem.id;
              const genSolution = generatedSolutions[problem.id];
              
              return (
                <Card key={problem.id} className="border-border">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                        {index + 1}
                      </span>
                      {problem.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="prose prose-sm max-w-none text-foreground">
                      <MarkdownWithMath content={problem.content} />
                    </div>
                    
                    {/* Solution Section */}
                    {problem.solution ? (
                      <Collapsible 
                        open={isVisible} 
                        onOpenChange={(open) => setSolutionVisibility(prev => ({ ...prev, [problem.id]: open }))}
                      >
                        <CollapsibleTrigger asChild>
                          <Button variant="outline" className="w-full justify-between">
                            <span className="flex items-center gap-2">
                              <Lightbulb className="h-4 w-4" />
                              {isVisible ? 'Hide Solution' : 'Show Solution'}
                            </span>
                            {isVisible ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-4">
                          <div className="rounded-lg border bg-card p-4">
                            <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                              <Lightbulb className="h-4 w-4 text-accent" />
                              Step-by-Step Solution
                            </h4>
                            <div className="prose prose-sm max-w-none text-muted-foreground">
                              <MarkdownWithMath content={problem.solution} />
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ) : (
                      /* AI Solution Fallback */
                      <div className="space-y-4">
                        {/* Dynamic Action Card - Slate Blue theme */}
                        {!genSolution && !isGenerating && (
                          <div
                            className="rounded-xl border-2 border-[#4A90E2]/30 bg-[#4A90E2]/5 p-5 cursor-pointer hover:bg-[#4A90E2]/10 hover:border-[#4A90E2]/50 transition-all group"
                            onClick={() => handleAskTutorForSolution(problem.title, problem.content)}
                          >
                            <div className="flex items-start gap-4">
                              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#4A90E2]/15 flex items-center justify-center group-hover:bg-[#4A90E2]/25 transition-colors">
                                <Sparkles className="h-5 w-5 text-[#4A90E2]" />
                              </div>
                              <div className="flex-1">
                                <h4 className="font-semibold text-foreground mb-1">No pre-written solution yet</h4>
                                <p className="text-sm text-muted-foreground">
                                  Click here to ask our AI Tutor for a detailed step-by-step guide!
                                </p>
                              </div>
                              <MessageCircle className="h-5 w-5 text-[#4A90E2] flex-shrink-0 mt-1 opacity-60 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>
                        )}

                        {/* Generate solution button as secondary action */}
                        {!genSolution && !isGenerating && (
                          <Button 
                            variant="outline" 
                            className="w-full gap-2 border-[#4A90E2]/30 hover:bg-[#4A90E2]/5 text-muted-foreground"
                            onClick={() => handleGenerateSolution(problem.id, problem.content)}
                          >
                            <Wand2 className="h-4 w-4" />
                            Or generate a quick solution here
                          </Button>
                        )}
                        
                        {isGenerating && (
                          <div className="rounded-lg border bg-card p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <Loader2 className="h-4 w-4 animate-spin text-[#4A90E2]" />
                              <span className="text-sm text-muted-foreground">Generating solution...</span>
                            </div>
                            {genSolution && (
                              <div className="prose prose-sm max-w-none text-muted-foreground">
                                <MarkdownWithMath content={genSolution} />
                              </div>
                            )}
                          </div>
                        )}
                        
                        {genSolution && !isGenerating && (
                          <Collapsible defaultOpen>
                            <CollapsibleTrigger asChild>
                              <Button variant="outline" className="w-full justify-between">
                                <span className="flex items-center gap-2">
                                  <Sparkles className="h-4 w-4 text-[#4A90E2]" />
                                  AI-Generated Solution
                                </span>
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="pt-4">
                              <div className="rounded-lg border bg-[#4A90E2]/5 p-4">
                                <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                                  <Sparkles className="h-4 w-4 text-[#4A90E2]" />
                                  Step-by-Step Solution
                                </h4>
                                <div className="prose prose-sm max-w-none text-muted-foreground">
                                  <MarkdownWithMath content={genSolution} />
                                </div>
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Generated Question Section */}
        {generatedQuestion && (
          <Card className="mb-8 border-primary/50 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary">
                <Sparkles className="h-5 w-5" />
                Generated Practice Question
              </CardTitle>
              <p className="text-sm text-muted-foreground">Topic: {generatedQuestion.topic}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="prose prose-sm max-w-none text-foreground">
                <MarkdownWithMath content={generatedQuestion.question} className="text-lg" />
              </div>
              
              {/* Show Solution Collapsible */}
              {generatedQuestion.solution && (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      <span className="flex items-center gap-2">
                        <Lightbulb className="h-4 w-4" />
                        Show Solution
                      </span>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-4">
                    <div className="rounded-lg border bg-card p-4">
                      <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Lightbulb className="h-4 w-4 text-accent" />
                        Step-by-Step Solution
                      </h4>
                      <div className="prose prose-sm max-w-none text-muted-foreground">
                        <MarkdownWithMath content={generatedQuestion.solution} />
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              <Button onClick={handleAskAITutor} size="lg" className="w-full">
                <Bot className="h-5 w-5 mr-2" />
                Ask AI Tutor for Help
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Make More Questions Button - Fixed at bottom right */}
        <div className="fixed bottom-8 right-8">
          <Button 
            onClick={handleGenerateQuestion} 
            disabled={isGenerating}
            size="lg"
            className="shadow-lg hover:shadow-xl transition-shadow"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5 mr-2" />
                Make more questions like this
              </>
            )}
          </Button>
        </div>

        {/* AI Tutor Drawer for Practice Problem Help */}
        <AITutorDrawer
          open={isDrawerOpen}
          onOpenChange={setIsDrawerOpen}
          sceneExplanation={drawerContext.explanation}
          sceneTimestamp={drawerContext.timestamp}
          videoTitle={video?.title || 'Practice Problem'}
          videoSubject={video?.subtitle || undefined}
        />
      </div>
    </div>
  );
}
