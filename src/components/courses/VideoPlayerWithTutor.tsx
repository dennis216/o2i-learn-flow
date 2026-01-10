import { useState, useRef, useEffect } from 'react';
import { Maximize, MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { AITutorSidebar } from './AITutorSidebar';
import { CourseVideo } from './types';
import { useIsMobile } from '@/hooks/use-mobile';

interface VideoPlayerWithTutorProps {
  video: CourseVideo;
  supabaseUrl: string;
}

export function VideoPlayerWithTutor({ video, supabaseUrl }: VideoPlayerWithTutorProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [showMobileTutor, setShowMobileTutor] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
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

  // Handle seek for both YouTube and native video
  const handleSeek = (seconds: number) => {
    if (isYouTube && iframeRef.current?.contentWindow) {
      // YouTube iframe API postMessage
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({
          event: 'command',
          func: 'seekTo',
          args: [seconds, true],
        }),
        '*'
      );
    } else if (videoRef.current) {
      videoRef.current.currentTime = seconds;
    }
    setCurrentTime(seconds);
  };

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

  // Track YouTube video time via postMessage
  useEffect(() => {
    if (!isYouTube) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data.event === 'infoDelivery' && data.info?.currentTime !== undefined) {
          setCurrentTime(data.info.currentTime);
        }
      } catch {
        // Ignore non-JSON messages
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isYouTube]);

  const handleFullscreen = () => {
    if (videoRef.current?.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  };

  const VideoPlayer = (
    <div className="relative group">
      {isYouTube ? (
        <iframe
          ref={iframeRef}
          className="w-full aspect-video rounded-lg"
          src={`https://www.youtube.com/embed/${youtubeId}?enablejsapi=1&origin=${window.location.origin}`}
          title={video.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
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

  // Mobile layout with FAB
  if (isMobile) {
    return (
      <div className="relative">
        {VideoPlayer}
        
        {/* Floating Action Button */}
        <Button
          className="fixed bottom-4 right-4 z-50 rounded-full h-14 w-14 shadow-lg"
          onClick={() => setShowMobileTutor(true)}
        >
          <MessageCircle className="h-6 w-6" />
        </Button>

        {/* Mobile Tutor Drawer */}
        {showMobileTutor && (
          <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
            <div className="fixed inset-x-0 bottom-0 top-20 bg-background border-t rounded-t-xl overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="font-semibold">AI Tutor</h3>
                <Button variant="ghost" size="icon" onClick={() => setShowMobileTutor(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <div className="flex-1 overflow-hidden">
                <AITutorSidebar
                  videoTitle={video.title}
                  transcript={video.transcript || null}
                  currentTime={currentTime}
                  onSeek={(seconds) => {
                    handleSeek(seconds);
                    setShowMobileTutor(false);
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop layout with resizable panels
  return (
    <ResizablePanelGroup direction="horizontal" className="min-h-[500px] rounded-lg border">
      <ResizablePanel defaultSize={65} minSize={40}>
        <div className="p-4">
          {VideoPlayer}
        </div>
      </ResizablePanel>
      
      <ResizableHandle withHandle />
      
      <ResizablePanel defaultSize={35} minSize={25}>
        <AITutorSidebar
          videoTitle={video.title}
          transcript={video.transcript || null}
          currentTime={currentTime}
          onSeek={handleSeek}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
