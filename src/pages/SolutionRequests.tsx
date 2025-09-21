import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Upload, Image as ImageIcon, Clock, CheckCircle, AlertCircle, Plus } from 'lucide-react';

interface SolutionRequest {
  id: string;
  title: string;
  description: string;
  image_url: string;
  status: string;
  solution_text: string;
  solution_image_url: string;
  created_at: string;
  problem_type: string;
  is_public: boolean;
  profiles: {
    full_name: string;
  };
}

const problemTypes = [
  { value: 'geometry', label: 'Geometry' },
  { value: 'algebra', label: 'Algebra' },
  { value: 'calculus', label: 'Calculus' },
  { value: 'number_theory', label: 'Number Theory' },
  { value: 'combinatorics', label: 'Combinatorics' },
  { value: 'pre_calculus', label: 'Pre-Calculus' },
  { value: 'statistics', label: 'Statistics' },
  { value: 'other', label: 'Other' }
];

export default function SolutionRequests() {
  const [requests, setRequests] = useState<SolutionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('solution_requests')
        .select(`
          *,
          profiles:user_id (full_name)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching requests:', error);
      } else {
        setRequests(data || []);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('solution-images')
        .upload(fileName, file);

      if (uploadError) {
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('solution-images')
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload image. Please try again.",
        variant: "destructive",
      });
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const formData = new FormData(e.currentTarget);
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const problemType = formData.get('problemType') as string;
    const isPublic = formData.get('isPublic') === 'on';
    const imageFile = formData.get('image') as File;

    let imageUrl = null;
    if (imageFile && imageFile.size > 0) {
      const input = document.createElement('input');
      input.type = 'file';
      input.files = new DataTransfer().files;
      const dt = new DataTransfer();
      dt.items.add(imageFile);
      const changeEvent = new Event('change', { bubbles: true });
      Object.defineProperty(changeEvent, 'target', { value: { files: dt.files }, enumerable: true });
      imageUrl = await handleImageUpload(changeEvent as any);
    }

    try {
      const { error } = await supabase
        .from('solution_requests')
        .insert({
          user_id: user.id,
          title,
          description,
          problem_type: problemType as any,
          is_public: isPublic,
          image_url: imageUrl
        });

      if (error) {
        throw error;
      }

      toast({
        title: "Request submitted!",
        description: "Your solution request has been posted successfully.",
      });

      setIsDialogOpen(false);
      fetchRequests();
      (e.target as HTMLFormElement).reset();
    } catch (error) {
      console.error('Error submitting request:', error);
      toast({
        title: "Error",
        description: "Failed to submit request. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4" />;
      case 'in_progress':
        return <AlertCircle className="h-4 w-4" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center mb-12">
            <Skeleton className="h-10 w-64 mx-auto mb-4" />
            <Skeleton className="h-6 w-96 mx-auto" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4">Solution Requests</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Upload math problems and get help from our expert tutors
          </p>
          
          {user && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button size="lg">
                  <Plus className="h-5 w-5 mr-2" />
                  Request Solution
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Submit Solution Request</DialogTitle>
                  <DialogDescription>
                    Upload an image of your math problem and describe what you need help with.
                  </DialogDescription>
                </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Problem Title</Label>
                      <Input
                        id="title"
                        name="title"
                        placeholder="e.g., Calculus Integration Problem"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="problemType">Problem Type</Label>
                      <Select name="problemType" required>
                        <SelectTrigger>
                          <SelectValue placeholder="Select problem type" />
                        </SelectTrigger>
                        <SelectContent>
                          {problemTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        name="description"
                        placeholder="Describe what you're struggling with or what specific help you need..."
                        rows={3}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="image">Upload Problem Image</Label>
                      <Input
                        id="image"
                        name="image"
                        type="file"
                        accept="image/*"
                        className="cursor-pointer"
                      />
                      <p className="text-sm text-muted-foreground">
                        Upload a clear image of your math problem
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox id="isPublic" name="isPublic" />
                      <Label htmlFor="isPublic" className="text-sm">
                        Allow other O2I users to view the solution to your problem. Your information will remain anonymous.
                      </Label>
                    </div>
                  
                  <Button type="submit" className="w-full" disabled={uploading}>
                    {uploading ? (
                      <>
                        <Upload className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Submit Request
                      </>
                    )}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {requests.length === 0 ? (
          <div className="text-center py-12">
            <ImageIcon className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">No solution requests yet</h3>
            <p className="text-muted-foreground">
              {user ? "Be the first to submit a math problem for help!" : "Sign in to submit solution requests"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {requests.map((request) => (
              <Card key={request.id} className="overflow-hidden hover:shadow-lg transition-shadow duration-300">
                <CardHeader>
                  <div className="flex justify-between items-start mb-2">
                    <Badge className={getStatusColor(request.status)} variant="secondary">
                      <span className="flex items-center gap-1">
                        {getStatusIcon(request.status)}
                        {request.status.replace('_', ' ')}
                      </span>
                    </Badge>
                  </div>
                  <CardTitle className="line-clamp-2">{request.title}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    By {request.profiles?.full_name || 'Anonymous'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {request.image_url && (
                    <div className="mb-4">
                      <img
                        src={request.image_url}
                        alt="Problem"
                        className="w-full h-32 object-cover rounded-md bg-muted"
                      />
                    </div>
                  )}
                  
                  {request.description && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                      {request.description}
                    </p>
                  )}
                  
                  {request.solution_text && (
                    <div className="bg-green-50 border border-green-200 rounded-md p-3 mb-4">
                      <h4 className="font-semibold text-green-800 mb-1">Solution:</h4>
                      <p className="text-sm text-green-700 line-clamp-3">
                        {request.solution_text}
                      </p>
                    </div>
                  )}
                  
                  <div className="text-xs text-muted-foreground">
                    Submitted {new Date(request.created_at).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}