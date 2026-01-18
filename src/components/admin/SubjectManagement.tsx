import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Pencil, Plus, Image, FolderOpen } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface Subject {
  id: string;
  name: string;
  category: string;
  icon_url: string | null;
  order_index: number;
  created_at: string;
}

export const SubjectManagement = () => {
  const { toast } = useToast();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    category: "High School",
    icon_url: "",
    order_index: "0",
  });

  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  useEffect(() => {
    fetchSubjects();
  }, []);

  const fetchSubjects = async () => {
    try {
      const { data, error } = await supabase
        .from("subjects")
        .select("*")
        .order("category", { ascending: true })
        .order("order_index", { ascending: true });

      if (error) throw error;
      setSubjects(data || []);
    } catch (error) {
      console.error("Error fetching subjects:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from("subjects").insert({
        name: formData.name.trim(),
        category: formData.category,
        icon_url: formData.icon_url || null,
        order_index: parseInt(formData.order_index) || 0,
      });

      if (error) throw error;

      toast({ title: "Subject created successfully" });
      setFormData({ name: "", category: "High School", icon_url: "", order_index: "0" });
      fetchSubjects();
    } catch (error: any) {
      console.error("Error creating subject:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const updateSubject = async () => {
    if (!editingSubject) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("subjects")
        .update({
          name: editingSubject.name,
          category: editingSubject.category,
          icon_url: editingSubject.icon_url,
          order_index: editingSubject.order_index,
        })
        .eq("id", editingSubject.id);

      if (error) throw error;
      toast({ title: "Subject updated successfully" });
      setEditDialogOpen(false);
      setEditingSubject(null);
      fetchSubjects();
    } catch (error: any) {
      console.error("Error updating subject:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const deleteSubject = async (subjectId: string) => {
    try {
      const { error } = await supabase.from("subjects").delete().eq("id", subjectId);
      if (error) throw error;
      toast({ title: "Subject deleted successfully" });
      fetchSubjects();
    } catch (error: any) {
      console.error("Error deleting subject:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const highSchoolSubjects = subjects.filter(s => s.category === "High School");
  const contestSubjects = subjects.filter(s => s.category === "Contest");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Create Subject Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create New Subject
          </CardTitle>
          <CardDescription>Add a new subject to organize courses and practice problems</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="subject_name">Subject Name *</Label>
                <Input
                  id="subject_name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Pre-Calc 12"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject_category">Category *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="High School">High School</SelectItem>
                    <SelectItem value="Contest">Contest</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="icon_url">Icon/Thumbnail URL (Optional)</Label>
                <Input
                  id="icon_url"
                  value={formData.icon_url}
                  onChange={(e) => setFormData({ ...formData, icon_url: e.target.value })}
                  placeholder="https://example.com/icon.png"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="order_index">Display Order</Label>
                <Input
                  id="order_index"
                  type="number"
                  value={formData.order_index}
                  onChange={(e) => setFormData({ ...formData, order_index: e.target.value })}
                />
              </div>
            </div>

            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Subject
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Subjects List */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* High School Subjects */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">High School Subjects</CardTitle>
            <CardDescription>{highSchoolSubjects.length} subjects</CardDescription>
          </CardHeader>
          <CardContent>
            {highSchoolSubjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No high school subjects yet.</p>
            ) : (
              <div className="space-y-2">
                {highSchoolSubjects.map((subject) => (
                  <div
                    key={subject.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {subject.icon_url ? (
                        <img src={subject.icon_url} alt="" className="h-8 w-8 rounded object-cover" />
                      ) : (
                        <FolderOpen className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div>
                        <p className="font-medium">{subject.name}</p>
                        <p className="text-xs text-muted-foreground">Order: {subject.order_index}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingSubject(subject);
                          setEditDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Subject</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{subject.name}"? This won't affect existing courses.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteSubject(subject.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contest Subjects */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contest Subjects</CardTitle>
            <CardDescription>{contestSubjects.length} subjects</CardDescription>
          </CardHeader>
          <CardContent>
            {contestSubjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contest subjects yet.</p>
            ) : (
              <div className="space-y-2">
                {contestSubjects.map((subject) => (
                  <div
                    key={subject.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {subject.icon_url ? (
                        <img src={subject.icon_url} alt="" className="h-8 w-8 rounded object-cover" />
                      ) : (
                        <FolderOpen className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div>
                        <p className="font-medium">{subject.name}</p>
                        <p className="text-xs text-muted-foreground">Order: {subject.order_index}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingSubject(subject);
                          setEditDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Subject</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{subject.name}"? This won't affect existing courses.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteSubject(subject.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Subject</DialogTitle>
          </DialogHeader>
          {editingSubject && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Subject Name</Label>
                <Input
                  value={editingSubject.name}
                  onChange={(e) => setEditingSubject({ ...editingSubject, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={editingSubject.category}
                  onValueChange={(value) => setEditingSubject({ ...editingSubject, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="High School">High School</SelectItem>
                    <SelectItem value="Contest">Contest</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Icon/Thumbnail URL</Label>
                <Input
                  value={editingSubject.icon_url || ""}
                  onChange={(e) => setEditingSubject({ ...editingSubject, icon_url: e.target.value || null })}
                  placeholder="https://example.com/icon.png"
                />
              </div>
              <div className="space-y-2">
                <Label>Display Order</Label>
                <Input
                  type="number"
                  value={editingSubject.order_index}
                  onChange={(e) => setEditingSubject({ ...editingSubject, order_index: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={updateSubject} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
