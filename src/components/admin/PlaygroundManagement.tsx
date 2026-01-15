import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trash2, Pencil, FlaskConical, ExternalLink } from 'lucide-react';
import MarkdownWithMath from '@/components/MarkdownWithMath';

interface PlaygroundLink {
  id: string;
  title: string;
  geogebra_url: string;
  description: string | null;
  target_subject: string;
  order_index: number;
  created_at: string;
}

// Subject options matching PDF categories
const HIGH_SCHOOL_SUBJECTS = [
  'AP Calc', 'AP Stats', 'AP Precalc', 'SAT',
  'M1', 'M2', 'Geo 1 (Intro)', 'Geo 2 (Int)',
  'Alg 1 (Intro)', 'Alg 2 (Int)',
  'Counting & Prob 1', 'Counting & Prob 2'
];

const CONTEST_SUBJECTS = [
  'AMC 10', 'AMC 12', 'Euclid', 'Fermat', 'Cayley', 'Pascal', 'Gauss'
];

const ALL_SUBJECTS = [...HIGH_SCHOOL_SUBJECTS, ...CONTEST_SUBJECTS];

export function PlaygroundManagement() {
  const { toast } = useToast();
  const [links, setLinks] = useState<PlaygroundLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    geogebra_url: '',
    description: '',
    target_subject: '',
    order_index: '0',
  });

  // Edit state
  const [editingLink, setEditingLink] = useState<PlaygroundLink | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  useEffect(() => {
    fetchLinks();
  }, []);

  const fetchLinks = async () => {
    try {
      const { data, error } = await supabase
        .from('playground_links')
        .select('*')
        .order('target_subject', { ascending: true })
        .order('order_index', { ascending: true });

      if (error) throw error;
      setLinks(data || []);
    } catch (error) {
      console.error('Error fetching playground links:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.geogebra_url || !formData.target_subject) {
      toast({ title: 'Error', description: 'Please fill in all required fields.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('playground_links').insert({
        title: formData.title,
        geogebra_url: formData.geogebra_url,
        description: formData.description || null,
        target_subject: formData.target_subject,
        order_index: parseInt(formData.order_index) || 0,
      });

      if (error) throw error;

      toast({ title: 'Success', description: 'Playground link added!' });
      setFormData({
        title: '',
        geogebra_url: '',
        description: '',
        target_subject: '',
        order_index: '0',
      });
      fetchLinks();
    } catch (error: any) {
      console.error('Error creating playground link:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingLink) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('playground_links')
        .update({
          title: editingLink.title,
          geogebra_url: editingLink.geogebra_url,
          description: editingLink.description,
          target_subject: editingLink.target_subject,
          order_index: editingLink.order_index,
        })
        .eq('id', editingLink.id);

      if (error) throw error;
      toast({ title: 'Success', description: 'Playground link updated!' });
      setEditDialogOpen(false);
      setEditingLink(null);
      fetchLinks();
    } catch (error: any) {
      console.error('Error updating playground link:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('playground_links').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Success', description: 'Playground link deleted!' });
      fetchLinks();
    } catch (error: any) {
      console.error('Error deleting playground link:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  // Group links by subject for display
  const groupedLinks = links.reduce((acc, link) => {
    if (!acc[link.target_subject]) {
      acc[link.target_subject] = [];
    }
    acc[link.target_subject].push(link);
    return acc;
  }, {} as Record<string, PlaygroundLink[]>);

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Add Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5" />
            Add GeoGebra Link
          </CardTitle>
          <CardDescription>Add a new interactive math model to the playground</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Derivative Visualizer"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="geogebra_url">GeoGebra Embed URL *</Label>
              <Input
                id="geogebra_url"
                value={formData.geogebra_url}
                onChange={(e) => setFormData({ ...formData, geogebra_url: e.target.value })}
                placeholder="https://www.geogebra.org/material/iframe/id/..."
                required
              />
              <p className="text-xs text-muted-foreground">
                Use the embed/iframe URL from GeoGebra (not the regular share link)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="target_subject">Target Subject *</Label>
                <Select
                  value={formData.target_subject}
                  onValueChange={(value) => setFormData({ ...formData, target_subject: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">High School</div>
                    {HIGH_SCHOOL_SUBJECTS.map((subject) => (
                      <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                    ))}
                    <div className="px-2 py-1 text-xs font-semibold text-muted-foreground mt-2">Contest</div>
                    {CONTEST_SUBJECTS.map((subject) => (
                      <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="order_index">Order</Label>
                <Input
                  id="order_index"
                  type="number"
                  value={formData.order_index}
                  onChange={(e) => setFormData({ ...formData, order_index: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (supports LaTeX)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Visualize the tangent line as $$\Delta x \to 0$$"
                rows={3}
              />
            </div>

            {formData.description && (
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Preview:</Label>
                <div className="p-3 border rounded-lg bg-muted/30">
                  <MarkdownWithMath content={formData.description} />
                </div>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Playground Link'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Existing Links */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Existing Links ({links.length})</h3>
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : links.length === 0 ? (
          <Card className="text-center py-8">
            <CardContent>
              <FlaskConical className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No playground links yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2">
            {Object.entries(groupedLinks).map(([subject, subjectLinks]) => (
              <div key={subject}>
                <h4 className="text-sm font-medium text-primary mb-2">{subject}</h4>
                <div className="space-y-2">
                  {subjectLinks.map((link) => (
                    <Card key={link.id} className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h5 className="font-medium truncate">{link.title}</h5>
                          <p className="text-xs text-muted-foreground truncate">{link.geogebra_url}</p>
                          {link.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{link.description}</p>
                          )}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => window.open(link.geogebra_url, '_blank')}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setEditingLink(link);
                              setEditDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Playground Link?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete "{link.title}".
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(link.id)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Playground Link</DialogTitle>
          </DialogHeader>
          {editingLink && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={editingLink.title}
                  onChange={(e) => setEditingLink({ ...editingLink, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>GeoGebra URL</Label>
                <Input
                  value={editingLink.geogebra_url}
                  onChange={(e) => setEditingLink({ ...editingLink, geogebra_url: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Target Subject</Label>
                  <Select
                    value={editingLink.target_subject}
                    onValueChange={(value) => setEditingLink({ ...editingLink, target_subject: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_SUBJECTS.map((subject) => (
                        <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Order</Label>
                  <Input
                    type="number"
                    value={editingLink.order_index}
                    onChange={(e) => setEditingLink({ ...editingLink, order_index: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editingLink.description || ''}
                  onChange={(e) => setEditingLink({ ...editingLink, description: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
