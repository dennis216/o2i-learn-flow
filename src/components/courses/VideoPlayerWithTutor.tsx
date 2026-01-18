import { useState, useRef, useEffect, useCallback } from 'react';
import { Maximize, MessageCircle, X, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { AITutorSidebar } from './AITutorSidebar';
import { StudyHub } from './StudyHub';
import { CourseVideo } from './types';
import { useIsMobile } from '@/hooks/use-mobile';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

// Props interface for VideoPlayerWithTutor component
interface VideoPlayerWithTutorProps {
  video: CourseVideo;
  supabaseUrl: string;
  courseSubject?: string;
  /** Initial time in seconds to seek to when video loads */
  initialTime?: number;
}

export function VideoPlayerWithTutor({ video, supabaseUrl, courseSubject, initialTime }: VideoPlayerWithTutorProps) {
  const [currentTime, setCurrentTime] = useState<number>(initialTime ?? 0);
  const [showMobileTutor, setShowMobileTutor] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMobile = useIsMobile();

  const isYouTube = video.video_url.includes('youtube.com') || video.video_url.includes('youtu.be');

  // Extract YouTube video ID
  const getYouTubeId = (url: string): string => {
    if (url.includes('youtu.be')) {
      return url.split('youtu.be/')[1]?.split('?')[0] || '';
    }
    return url.split('v=')[1]?.split('&')[0] || '';
  };

  const youtubeId = isYouTube ? getYouTubeId(video.video_url) : '';

  // Load YouTube Iframe API
  useEffect(() => {
    if (!isYouTube) return;

    // Load the YouTube API script if not already loaded
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    // Initialize player when API is ready
    const initPlayer = () => {
      if (playerContainerRef.current && window.YT && window.YT.Player) {
        playerRef.current = new window.YT.Player(playerContainerRef.current, {
          videoId: youtubeId,
          playerVars: {
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              setPlayerReady(true);
            },
          },
        });
      }
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      if (playerRef.current?.destroy) {
        playerRef.current.destroy();
      }
    };
  }, [isYouTube, youtubeId]);

  // Seek to initial time when player is ready
  useEffect(() => {
    if (!playerReady || !initialTime) return;
    
    if (isYouTube && playerRef.current?.seekTo) {
      playerRef.current.seekTo(initialTime, true);
      setCurrentTime(initialTime);
    } else if (videoRef.current) {
      videoRef.current.currentTime = initialTime;
      setCurrentTime(initialTime);
    }
  }, [playerReady, initialTime, isYouTube]);

  // Poll YouTube player for current time every 500ms
  useEffect(() => {
    if (!isYouTube || !playerReady) return;

    intervalRef.current = setInterval(() => {
      if (playerRef.current?.getCurrentTime) {
        const time = playerRef.current.getCurrentTime();
        setCurrentTime(time);
      }
    }, 500);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isYouTube, playerReady]);

  // Handle seek for both YouTube and native video
  const handleSeek = useCallback((seconds: number) => {
    if (isYouTube && playerRef.current?.seekTo) {
      playerRef.current.seekTo(seconds, true);
      setCurrentTime(seconds);
    } else if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      setCurrentTime(seconds);
    }
  }, [isYouTube]);

  // Track video time for native video
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const handleTimeUpdate = () => {
      setCurrentTime(videoElement.currentTime);
    };

    videoElement.addEventListener('timeupdate', handleTimeUpdate);
    return () => videoElement.removeEventListener('timeupdate', handleTimeUpdate);
  }, []);

  const handleFullscreen = () => {
    if (videoRef.current?.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  };

  const VideoPlayer = (
    <div className="relative group">
      {isYouTube ? (
        <div 
          ref={playerContainerRef}
          className="w-full aspect-video rounded-lg"
        />
      ) : (
        <>
          <video
            ref={videoRef}
            controls
            className="w-full rounded-lg"
            src={`${supabaseUrl}/storage/v1/object/public/${video.video_url}`}
          >
            Your browser does not support the video tag.
          </video>
          <Button
            variant="secondary"
            size="icon"
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleFullscreen}
          >
            <Maximize className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );

  // Mobile layout - stacked: video on top, chat below
  if (isMobile) {
    return (
      <div className="flex flex-col h-full">
        {/* Video on top */}
        <div className="flex-shrink-0">
          {VideoPlayer}
          <div className="p-3">
            <h3 className="font-semibold text-base">{video.title}</h3>
            {video.description && (
              <p className="text-muted-foreground text-sm mt-1">{video.description}</p>
            )}
          </div>
        </div>
        
        {/* AI Tutor below - collapsible on mobile */}
        {showMobileTutor ? (
          <div className="flex-1 border-t min-h-[300px]">
            <div className="flex items-center justify-between p-3 border-b bg-muted/50">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                AI Tutor
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setShowMobileTutor(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="h-[350px]">
              <AITutorSidebar
                videoTitle={video.title}
                transcript={video.transcript || null}
                currentTime={currentTime}
                onSeek={handleSeek}
                videoId={video.id}
                courseId={video.course_id}
                courseSubject={courseSubject}
              />
            </div>
          </div>
        ) : (
          <Button 
            className="m-3 gap-2" 
            variant="outline"
            onClick={() => setShowMobileTutor(true)}
          >
            <MessageCircle className="h-4 w-4" />
            Open AI Tutor
          </Button>
        )}
      </div>
    );
  }

  // Desktop layout with resizable panels (70/30 split)
  return (
    <div className="space-y-0">
      <ResizablePanelGroup direction="horizontal" className="min-h-[500px] rounded-lg border">
        <ResizablePanel defaultSize={70} minSize={50}>
          <div className="p-4 h-full flex flex-col">
            {VideoPlayer}
            <div className="mt-4">
              <h3 className="font-semibold text-lg">{video.title}</h3>
              {video.description && (
                <p className="text-muted-foreground text-sm mt-1">{video.description}</p>
              )}
            </div>
          </div>
        </ResizablePanel>
        
        <ResizableHandle withHandle />
        
        <ResizablePanel defaultSize={30} minSize={20}>
          <AITutorSidebar
            videoTitle={video.title}
            transcript={video.transcript || null}
            currentTime={currentTime}
            onSeek={handleSeek}
            videoId={video.id}
            courseId={video.course_id}
            courseSubject={courseSubject}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Study Hub below the video player */}
      <StudyHub video={video} currentTime={currentTime} courseSubject={courseSubject} />
    </div>
  );
}
