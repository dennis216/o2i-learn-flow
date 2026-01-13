import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, Play, Sparkles, Bot, Loader2, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';
import { TranscriptEntry } from '@/components/courses/types';
import { toast } from 'sonner';

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
  const [loading, setLoading] = useState(true);
  const [generatedQuestion, setGeneratedQuestion] = useState<GeneratedQuestion | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSolution, setShowSolution] = useState(false);

  useEffect(() => {
    const fetchVideo = async () => {
      if (!videoId) return;

      try {
        const { data, error } = await supabase
          .from('course_videos')
          .select('id, title, subtitle, video_url, transcript, course_id')
          .eq('id', videoId)
          .single();

        if (error) {
          console.error('Error fetching video:', error);
          toast.error('Failed to load lesson');
        } else if (data) {
          setVideo({
            ...data,
            transcript: data.transcript as unknown as TranscriptEntry[] | null,
          });
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchVideo();
  }, [videoId]);

  const handleGenerateQuestion = async () => {
    if (!video?.transcript || video.transcript.length === 0) {
      toast.error('No transcript available for this lesson');
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-practice-question`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcript: video.transcript,
          videoTitle: video.title,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate question');
      }

      const data = await response.json();
      setGeneratedQuestion({
        question: data.question,
        topic: data.topic || video.title,
        solution: data.solution,
      });
      setShowSolution(false); // Reset solution visibility for new question
    } catch (error) {
      console.error('Error generating question:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate question');
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
                <p className="whitespace-pre-wrap text-lg">{generatedQuestion.question}</p>
              </div>
              
              {/* Show Solution Collapsible */}
              {generatedQuestion.solution && (
                <Collapsible open={showSolution} onOpenChange={setShowSolution}>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      <span className="flex items-center gap-2">
                        <Lightbulb className="h-4 w-4" />
                        {showSolution ? 'Hide Solution' : 'Show Solution'}
                      </span>
                      {showSolution ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-4">
                    <div className="rounded-lg border bg-card p-4">
                      <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Lightbulb className="h-4 w-4 text-yellow-500" />
                        Step-by-Step Solution
                      </h4>
                      <div className="prose prose-sm max-w-none text-muted-foreground">
                        <p className="whitespace-pre-wrap">{generatedQuestion.solution}</p>
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
      </div>
    </div>
  );
}