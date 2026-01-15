import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Brain, ClipboardList, FlaskConical } from 'lucide-react';
import { CourseVideo } from './types';
import { NotesAndPDF } from './study-hub/NotesAndPDF';
import { AISummary } from './study-hub/AISummary';
import { ExamPrep } from './study-hub/ExamPrep';
import { InteractiveLab } from './study-hub/InteractiveLab';

interface StudyHubProps {
  video: CourseVideo;
  currentTime: number;
  courseSubject?: string;
}

export function StudyHub({ video, currentTime, courseSubject }: StudyHubProps) {
  const [activeTab, setActiveTab] = useState('notes');

  return (
    <div className="mt-6 border rounded-lg bg-card">
      <div className="p-4 border-b bg-muted/30">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          Study Hub
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Enhance your learning with AI-powered study tools
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0">
          <TabsTrigger
            value="notes"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
          >
            <FileText className="h-4 w-4 mr-2" />
            Notes & PDF
          </TabsTrigger>
          <TabsTrigger
            value="summary"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
          >
            <Brain className="h-4 w-4 mr-2" />
            AI Summary
          </TabsTrigger>
          <TabsTrigger
            value="exam"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
          >
            <ClipboardList className="h-4 w-4 mr-2" />
            Exam Prep
          </TabsTrigger>
          <TabsTrigger
            value="lab"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
          >
            <FlaskConical className="h-4 w-4 mr-2" />
            Interactive Lab
          </TabsTrigger>
        </TabsList>

        <TabsContent value="notes" className="p-4 mt-0">
          <NotesAndPDF video={video} currentTime={currentTime} />
        </TabsContent>

        <TabsContent value="summary" className="p-4 mt-0">
          <AISummary video={video} />
        </TabsContent>

        <TabsContent value="exam" className="p-4 mt-0">
          <ExamPrep video={video} />
        </TabsContent>

        <TabsContent value="lab" className="p-4 mt-0">
          <InteractiveLab video={video} courseSubject={courseSubject} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
