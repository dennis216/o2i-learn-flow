import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { MessageSquare, User, Clock, ArrowLeft, Send } from 'lucide-react';

interface ForumPost {
  id: string;
  title: string;
  content: string;
  category: string;
  created_at: string;
  profiles: {
    full_name: string;
  };
}

interface DiscussionPost {
  id: string;
  content: string;
  created_at: string;
  profiles: {
    full_name: string;
  };
}

export default function Discussion() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [forumPost, setForumPost] = useState<ForumPost | null>(null);
  const [discussionPosts, setDiscussionPosts] = useState<DiscussionPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (postId) {
      fetchData();
    }
  }, [postId]);

  const fetchData = async () => {
    try {
      // Fetch the main forum post
      const { data: post, error: postError } = await supabase
        .from('forum_posts')
        .select(`
          *,
          profiles:user_id (full_name)
        `)
        .eq('id', postId)
        .single();

      if (postError) {
        console.error('Error fetching post:', postError);
        navigate('/forum');
        return;
      }

      setForumPost(post);

      // Fetch discussion posts  
      const { data: discussions, error: discussionsError } = await supabase
        .from('discussion_posts')
        .select(`
          id,
          content,
          created_at,
          user_id,
          profiles!discussion_posts_user_id_fkey (full_name)
        `)
        .eq('forum_post_id', postId)
        .order('created_at', { ascending: true });

      if (discussionsError) {
        console.error('Error fetching discussions:', discussionsError);
      } else {
        setDiscussionPosts(discussions || []);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitReply = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !postId) return;

    const formData = new FormData(e.currentTarget);
    const content = formData.get('content') as string;

    if (!content.trim()) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('discussion_posts')
        .insert({
          forum_post_id: postId,
          user_id: user.id,
          content: content.trim()
        });

      if (error) {
        throw error;
      }

      toast({
        title: "Reply posted!",
        description: "Your reply has been added to the discussion.",
      });

      (e.target as HTMLFormElement).reset();
      fetchData(); // Refresh to show new reply
    } catch (error) {
      console.error('Error posting reply:', error);
      toast({
        title: "Error",
        description: "Failed to post reply. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'general':
        return 'bg-blue-100 text-blue-800';
      case 'homework_help':
        return 'bg-orange-100 text-orange-800';
      case 'study_tips':
        return 'bg-green-100 text-green-800';
      case 'course_discussion':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <Skeleton className="h-8 w-32 mb-6" />
          <Card className="mb-6">
            <CardHeader>
              <Skeleton className="h-6 w-20 mb-2" />
              <Skeleton className="h-8 w-3/4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-16 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!forumPost) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Post not found</h1>
            <Button onClick={() => navigate('/forum')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Forum
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Button 
          variant="ghost" 
          onClick={() => navigate('/forum')} 
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Forum
        </Button>

        {/* Main Forum Post */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex justify-between items-start mb-2">
              <Badge className={getCategoryColor(forumPost.category)} variant="secondary">
                {forumPost.category.replace('_', ' ')}
              </Badge>
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <User className="h-4 w-4" />
                {forumPost.profiles?.full_name || 'Anonymous'}
              </div>
            </div>
            <CardTitle className="text-2xl">{forumPost.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4 whitespace-pre-wrap">
              {forumPost.content}
            </p>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              {new Date(forumPost.created_at).toLocaleDateString()}
            </div>
          </CardContent>
        </Card>

        {/* Discussion Posts */}
        <div className="space-y-4 mb-8">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Discussion ({discussionPosts.length})
          </h2>
          
          {discussionPosts.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No replies yet. Be the first to join the discussion!
              </CardContent>
            </Card>
          ) : (
            discussionPosts.map((post) => (
              <Card key={post.id}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4" />
                      {post.profiles?.full_name || 'Anonymous'}
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {new Date(post.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">{post.content}</p>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Reply Form */}
        {user ? (
          <Card>
            <CardHeader>
              <CardTitle>Add a Reply</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitReply} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="content">Your Reply</Label>
                  <Textarea
                    id="content"
                    name="content"
                    placeholder="Share your thoughts, ask questions, or provide help..."
                    rows={4}
                    required
                  />
                </div>
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Send className="h-4 w-4 mr-2 animate-pulse" />
                      Posting...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Post Reply
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground mb-4">Sign in to join the discussion</p>
              <Button onClick={() => navigate('/auth')}>Sign In</Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}