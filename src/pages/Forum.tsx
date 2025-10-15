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
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { MessageSquare, Plus, User, Clock, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ForumPost {
  id: string;
  user_id: string;
  title: string;
  content: string;
  category: string;
  tags?: string[];
  created_at: string;
  post_replies: { count: number }[];
  display_name?: string;
}

const categories = [
  { value: 'general', label: 'General Discussion' },
  { value: 'homework_help', label: 'Homework Help' },
  { value: 'study_tips', label: 'Study Tips' },
  { value: 'course_discussion', label: 'Course Discussion' }
];

export default function Forum() {
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [filteredPosts, setFilteredPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [currentTags, setCurrentTags] = useState<string[]>([]);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchPosts();
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredPosts(posts);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = posts.filter((post) => {
      const titleMatch = post.title.toLowerCase().includes(query);
      const userMatch = post.display_name?.toLowerCase().includes(query);
      const tagMatch = post.tags?.some(tag => tag.toLowerCase().includes(query));
      
      return titleMatch || userMatch || tagMatch;
    });

    setFilteredPosts(filtered);
  }, [searchQuery, posts]);

  const fetchPosts = async () => {
    try {
      const { data, error } = await supabase
        .from('forum_posts')
        .select(`
          *,
          post_replies(count)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching posts:', error);
      } else {
        const posts = data || [];
        if (posts.length === 0) {
          setPosts([]);
          setFilteredPosts([]);
        } else {
          const userIds = Array.from(new Set(posts.map((p: any) => p.user_id).filter(Boolean)));
          const { data: profilesData } = await supabase
            .from('public_profiles')
            .select('user_id, full_name')
            .in('user_id', userIds);
          const nameMap = new Map((profilesData || []).map((p: any) => [p.user_id, p.full_name]));
          const postsWithNames = posts.map((p: any) => ({
            ...p,
            display_name: nameMap.get(p.user_id) || 'User',
          }));
          setPosts(postsWithNames);
          setFilteredPosts(postsWithNames);
        }
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !currentTags.includes(tagInput.trim())) {
      setCurrentTags([...currentTags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setCurrentTags(currentTags.filter(tag => tag !== tagToRemove));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const formData = new FormData(e.currentTarget);
    const title = formData.get('title') as string;
    const content = formData.get('content') as string;

    try {
      const { error } = await supabase
        .from('forum_posts')
        .insert({
          user_id: user.id,
          title,
          content,
          category: 'general',
          tags: currentTags.length > 0 ? currentTags : null
        });

      if (error) {
        throw error;
      }

      toast({
        title: "Post created!",
        description: "Your forum post has been published successfully.",
      });

      setIsDialogOpen(false);
      setCurrentTags([]);
      setTagInput('');
      fetchPosts();
      (e.target as HTMLFormElement).reset();
    } catch (error) {
      console.error('Error creating post:', error);
      toast({
        title: "Error",
        description: "Failed to create post. Please try again.",
        variant: "destructive",
      });
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

  const getCategoryLabel = (category: string) => {
    const cat = categories.find(c => c.value === category);
    return cat ? cat.label : category;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center mb-12">
            <Skeleton className="h-10 w-64 mx-auto mb-4" />
            <Skeleton className="h-6 w-96 mx-auto" />
          </div>
          <div className="space-y-6">
            {[...Array(5)].map((_, i) => (
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
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4">Math Community Forum</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Connect with fellow students, share study tips, and get help with math problems
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            {user && (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="lg">
                    <Plus className="h-5 w-5 mr-2" />
                    Create Post
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Create New Post</DialogTitle>
                    <DialogDescription>
                      Share your thoughts, ask questions, or start a discussion.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Title</Label>
                      <Input
                        id="title"
                        name="title"
                        placeholder="Enter post title..."
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="content">Content</Label>
                      <Textarea
                        id="content"
                        name="content"
                        placeholder="Write your post content..."
                        rows={4}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="tags">Tags</Label>
                      <div className="flex gap-2">
                        <Input
                          id="tags"
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddTag();
                            }
                          }}
                          placeholder="Add tags (press Enter)"
                        />
                        <Button type="button" onClick={handleAddTag} variant="outline">
                          Add
                        </Button>
                      </div>
                      {currentTags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {currentTags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="gap-1">
                              {tag}
                              <X 
                                className="h-3 w-3 cursor-pointer" 
                                onClick={() => handleRemoveTag(tag)}
                              />
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <Button type="submit" className="w-full">
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Create Post
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            )}
            
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by title, user, or tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </div>

        {filteredPosts.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">
              {searchQuery ? 'No posts found' : 'No posts yet'}
            </h3>
            <p className="text-muted-foreground">
              {searchQuery 
                ? 'Try a different search term' 
                : user 
                  ? "Be the first to start a conversation!" 
                  : "Sign in to create posts and join discussions"
              }
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredPosts.map((post) => (
              <Card key={post.id} className="hover:shadow-lg transition-shadow duration-300">
                <CardHeader>
                  <div className="flex justify-between items-start mb-2">
                    <Badge className={getCategoryColor(post.category)} variant="secondary">
                      {getCategoryLabel(post.category)}
                    </Badge>
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <User className="h-4 w-4" />
                      {post.display_name}
                    </div>
                  </div>
                  <CardTitle className="text-left">{post.title}</CardTitle>
                  {post.tags && post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {post.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4 line-clamp-3">
                    {post.content}
                  </p>
                  
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <MessageSquare className="h-4 w-4" />
                        {post.post_replies?.[0]?.count || 0} replies
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {new Date(post.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => navigate(`/forum/${post.id}`)}
                    >
                      View Discussion
                    </Button>
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