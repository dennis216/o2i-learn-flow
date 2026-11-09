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
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { Upload, Image as ImageIcon, Clock, CheckCircle, AlertCircle, Plus } from 'lucide-react';

interface SolutionRequest {
  id: string;
  user_id: string;
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
  { value: 'geometry', label: 'Geometry', zh: '几何' },
  { value: 'algebra', label: 'Algebra', zh: '代数' },
  { value: 'calculus', label: 'Calculus', zh: '微积分' },
  { value: 'number_theory', label: 'Number Theory', zh: '数论' },
  { value: 'combinatorics', label: 'Combinatorics', zh: '组合' },
  { value: 'pre_calculus', label: 'Pre-Calculus', zh: '预备微积分' },
  { value: 'statistics', label: 'Statistics', zh: '统计' },
  { value: 'other', label: 'Other', zh: '其他' }
];

const STATUS_ZH: Record<string, string> = { pending: '待处理', in_progress: '处理中', completed: '已完成', solved: '已解答' };

export default function SolutionRequests() {
  const [requests, setRequests] = useState<SolutionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [problemTypeValue, setProblemTypeValue] = useState<string>('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const { user } = useAuth();
  const { toast } = useToast();
  const { language, t } = useLanguage();

  useEffect(() => {
    fetchRequests();
  }, []);

  // Helper to extract path from a storage URL
  const extractPathFromUrl = (url: string): string => {
    // URL format: https://<project>.supabase.co/storage/v1/object/public/solution-images/<path>
    // We need to extract just the path part after the bucket name
    const match = url.match(/solution-images\/(.+)$/);
    return match ? match[1] : url;
  };

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
        const reqs = data || [];
        
        // Generate signed URLs for images in the private bucket
        const reqsWithSignedUrls = await Promise.all(
          reqs.map(async (request: any) => {
            // Only generate signed URLs for requests the user can view
            if (request.image_url) {
              const path = extractPathFromUrl(request.image_url);
              const { data: signedData } = await supabase.storage
                .from('solution-images')
                .createSignedUrl(path, 3600); // 1 hour expiry
              if (signedData?.signedUrl) {
                request.image_url = signedData.signedUrl;
              }
            }
            if (request.solution_image_url) {
              const path = extractPathFromUrl(request.solution_image_url);
              const { data: signedData } = await supabase.storage
                .from('solution-images')
                .createSignedUrl(path, 3600);
              if (signedData?.signedUrl) {
                request.solution_image_url = signedData.signedUrl;
              }
            }
            return request;
          })
        );
        
        setRequests(reqsWithSignedUrls);
        
        // Auto-mark solved if a solution exists
        const toSolve = reqsWithSignedUrls.filter((r: any) => (r.solution_text || r.solution_image_url) && r.status !== 'solved');
        if (toSolve.length > 0) {
          try {
            await Promise.all(
              toSolve.map((r: any) =>
                supabase.from('solution_requests').update({ status: 'solved' }).eq('id', r.id)
              )
            );
            // Re-fetch to get updated status (signed URLs will be regenerated)
            fetchRequests();
            return; // Exit early since we're re-fetching
          } catch (e) {
            // silently ignore if user lacks permission per RLS
          }
        }
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
        title: t('Upload failed', '上传失败'),
        description: t('Failed to upload image. Please try again.', '图片上传失败，请重试。'),
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
const imageFile = formData.get('image') as File;

// Validate dropdown selections
if (!problemTypeValue) {
  toast({ title: t('Select a problem type', '请选择题目类型'), variant: 'destructive' });
  return;
}
const isPublic = visibility === 'public';

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
      problem_type: problemTypeValue as any,
      is_public: isPublic,
      image_url: imageUrl
    });

      if (error) {
        throw error;
      }

      toast({
        title: t('Request submitted!', '已提交！'),
        description: t('Your solution request has been posted successfully.', '你的求解请求已成功提交。'),
      });

      setIsDialogOpen(false);
      fetchRequests();
      (e.target as HTMLFormElement).reset();
    } catch (error) {
      console.error('Error submitting request:', error);
      toast({
        title: t('Error', '出错了'),
        description: t('Failed to submit request. Please try again.', '提交失败，请重试。'),
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
    case 'solved':
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
      case 'solved':
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
          <h1 className="text-4xl font-bold text-foreground mb-4">{t('Solution Requests', '求解请求')}</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            {t('Upload math problems and get help from our expert tutors', '上传数学题，获得老师的帮助')}
          </p>
          
          {user && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button size="lg">
                  <Plus className="h-5 w-5 mr-2" />
                  {t('Request Solution', '提交求解请求')}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>{t('Submit Solution Request', '提交求解请求')}</DialogTitle>
                  <DialogDescription>
                    {t('Upload an image of your math problem and describe what you need help with.', '上传题目图片，并说明你需要哪方面的帮助。')}
                  </DialogDescription>
                </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">{t('Problem Title', '题目标题')}</Label>
                      <Input
                        id="title"
                        name="title"
                        placeholder={t('e.g., Calculus Integration Problem', '例如：微积分积分题')}
                        required
                      />
                    </div>

<div className="space-y-2">
  <Label htmlFor="problemType">{t('Problem Type', '题目类型')}</Label>
  <Select value={problemTypeValue} onValueChange={setProblemTypeValue}>
    <SelectTrigger>
      <SelectValue placeholder={t('Select problem type', '选择题目类型')} />
    </SelectTrigger>
    <SelectContent>
      {problemTypes.map((type) => (
        <SelectItem key={type.value} value={type.value}>
          {language === 'zh' ? type.zh : type.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="description">{t('Description', '描述')}</Label>
                      <Textarea
                        id="description"
                        name="description"
                        placeholder={t("Describe what you're struggling with or what specific help you need...", '说说你卡在哪里，或者需要什么具体帮助…')}
                        rows={3}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="image">{t('Upload Problem Image', '上传题目图片')}</Label>
                      <Input
                        id="image"
                        name="image"
                        type="file"
                        accept="image/*"
                        className="cursor-pointer"
                      />
                      <p className="text-sm text-muted-foreground">
                        {t('Upload a clear image of your math problem', '请上传清晰的题目图片')}
                      </p>
                    </div>

<div className="space-y-2">
  <Label>{t('Visibility', '公开范围')}</Label>
  <Select value={visibility} onValueChange={(v) => setVisibility(v as 'public' | 'private')}>
    <SelectTrigger>
      <SelectValue placeholder={t('Choose public or private', '选择公开或私密')} />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="private">{t('Private (only you can see the solution)', '私密（只有你能看到解答）')}</SelectItem>
      <SelectItem value="public">{t('Public (shown as anonymous to others)', '公开（对其他人匿名显示）')}</SelectItem>
    </SelectContent>
  </Select>
</div>
                  
                  <Button type="submit" className="w-full" disabled={uploading}>
                    {uploading ? (
                      <>
                        <Upload className="h-4 w-4 mr-2 animate-spin" />
                        {t('Uploading...', '上传中…')}
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        {t('Submit Request', '提交请求')}
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
            <h3 className="text-xl font-semibold text-foreground mb-2">{t('No solution requests yet', '还没有求解请求')}</h3>
            <p className="text-muted-foreground">
              {user ? t('Be the first to submit a math problem for help!', '来提交第一道求助的题吧！') : t('Sign in to submit solution requests', '登录后提交求解请求')}
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
                        {language === 'zh' ? STATUS_ZH[request.status] ?? request.status : request.status.replace('_', ' ')}
                      </span>
                    </Badge>
                  </div>
                  <CardTitle className="line-clamp-2">{request.title}</CardTitle>
<CardDescription className="line-clamp-2">
  {request.is_public ? t('By Anonymous', '匿名') : (user?.id === request.user_id ? t('By You', '我的请求') : t('Private request', '私密请求'))}
</CardDescription>
                </CardHeader>
                <CardContent>
                  {request.image_url && (
                    <div className="mb-4">
                      <img
                        src={request.image_url}
                        alt={t('Problem', '题目')}
                        className="w-full h-32 object-cover rounded-md bg-muted"
                      />
                    </div>
                  )}
                  
                  {request.description && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                      {request.description}
                    </p>
                  )}
                  
{request.solution_text && (request.is_public || user?.id === request.user_id) && (
  <div className="bg-green-50 border border-green-200 rounded-md p-3 mb-4">
    <h4 className="font-semibold text-green-800 mb-1">{t('Solution:', '解答：')}</h4>
    <p className="text-sm text-green-700 line-clamp-3">
      {request.solution_text}
    </p>
  </div>
)}
                  
                  <div className="text-xs text-muted-foreground">
                    {t('Submitted', '提交于')} {new Date(request.created_at).toLocaleDateString()}
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