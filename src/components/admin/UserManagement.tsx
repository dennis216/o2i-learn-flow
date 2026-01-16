import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Shield, ShieldCheck, ShieldX, Search, UserCog, CheckCircle } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string | null;
  created_at: string;
}

interface UserRole {
  user_id: string;
  role: 'admin' | 'instructor' | 'student' | 'super_admin';
}

export const UserManagement = () => {
  const { isSuperAdmin, user } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userRoles, setUserRoles] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchUsers();
      fetchUserRoles();
    }
  }, [isSuperAdmin]);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, email, role, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast({ title: "Error", description: "Failed to fetch users", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchUserRoles = async () => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (error) throw error;

      const rolesMap = new Map<string, string[]>();
      (data || []).forEach((ur: any) => {
        const existing = rolesMap.get(ur.user_id) || [];
        existing.push(ur.role);
        rolesMap.set(ur.user_id, existing);
      });
      setUserRoles(rolesMap);
    } catch (error) {
      console.error("Error fetching user roles:", error);
    }
  };

  const grantAdminRole = async (userId: string) => {
    setProcessingUserId(userId);
    try {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: 'admin' });

      if (error) {
        if (error.code === '23505') {
          toast({ title: "Info", description: "User already has admin role" });
        } else {
          throw error;
        }
      } else {
        toast({ title: "Success", description: "Admin role granted" });
        fetchUserRoles();
      }
    } catch (error: any) {
      console.error("Error granting admin role:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessingUserId(null);
    }
  };

  const revokeAdminRole = async (userId: string) => {
    // Prevent revoking own super_admin or admin role
    if (userId === user?.id) {
      toast({ title: "Error", description: "Cannot revoke your own admin role", variant: "destructive" });
      return;
    }

    setProcessingUserId(userId);
    try {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", "admin");

      if (error) throw error;
      toast({ title: "Success", description: "Admin role revoked" });
      fetchUserRoles();
    } catch (error: any) {
      console.error("Error revoking admin role:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessingUserId(null);
    }
  };

  const forceConfirmUser = async (userId: string, userEmail: string) => {
    setProcessingUserId(userId);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        toast({ title: "Error", description: "Not authenticated", variant: "destructive" });
        return;
      }

      const response = await fetch(
        `https://lxoaeaewcrshjkigzyqe.supabase.co/functions/v1/force-confirm-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ userId }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to confirm user');
      }

      toast({ title: "Success", description: `Email confirmed for ${userEmail}` });
    } catch (error: any) {
      console.error("Error force confirming user:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setProcessingUserId(null);
    }
  };

  const filteredUsers = users.filter((u) => {
    const query = searchQuery.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(query) ||
      u.email?.toLowerCase().includes(query)
    );
  });

  if (!isSuperAdmin) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ShieldX className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h3 className="text-xl font-semibold">Access Denied</h3>
          <p className="text-muted-foreground">Only Super Admins can access user management.</p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-muted-foreground mt-2">Loading users...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCog className="h-5 w-5" />
          User Management
        </CardTitle>
        <CardDescription>
          Manage user roles and permissions. Grant or revoke admin access.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left p-3 font-semibold text-sm">User</th>
                <th className="text-left p-3 font-semibold text-sm">Roles</th>
                <th className="text-left p-3 font-semibold text-sm">Joined</th>
                <th className="text-right p-3 font-semibold text-sm">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y max-h-[500px] overflow-y-auto">
          {filteredUsers.length === 0 ? (
            <tr><td colSpan={4} className="text-muted-foreground text-center py-8">No users found</td></tr>
          ) : (
            filteredUsers.map((userProfile, index) => {
              const roles = userRoles.get(userProfile.user_id) || [];
              const isAdmin = roles.includes('admin');
              const isSuperAdminUser = roles.includes('super_admin');
              const isCurrentUser = userProfile.user_id === user?.id;

              return (
                <tr
                  key={userProfile.id}
                  className={`hover:bg-accent/30 transition-colors ${index % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}
                >
                  <td className="p-3">
                    <div className="flex flex-col">
                      <span className="font-semibold">{userProfile.full_name}</span>
                      <span className="text-sm text-muted-foreground">{userProfile.email}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isSuperAdminUser && (
                        <Badge variant="default" className="bg-purple-600">
                          <Shield className="h-3 w-3 mr-1" />
                          Super Admin
                        </Badge>
                      )}
                      {isAdmin && !isSuperAdminUser && (
                        <Badge variant="secondary">
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          Admin
                        </Badge>
                      )}
                      {!isAdmin && !isSuperAdminUser && (
                        <Badge variant="outline">Student</Badge>
                      )}
                      {isCurrentUser && (
                        <Badge variant="outline" className="border-primary text-primary">You</Badge>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">
                    {new Date(userProfile.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                    {!isSuperAdminUser && !isCurrentUser && (
                      <>
                        {isAdmin ? (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-destructive"
                                disabled={processingUserId === userProfile.user_id}
                              >
                                {processingUserId === userProfile.user_id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <ShieldX className="h-4 w-4 mr-1" />
                                    Revoke
                                  </>
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Revoke Admin Role?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will remove admin privileges from {userProfile.full_name}. They will no longer be able to access the admin dashboard.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => revokeAdminRole(userProfile.user_id)}>
                                  Revoke
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => grantAdminRole(userProfile.user_id)}
                            disabled={processingUserId === userProfile.user_id}
                          >
                            {processingUserId === userProfile.user_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <ShieldCheck className="h-4 w-4 mr-1" />
                                Grant Admin
                              </>
                            )}
                          </Button>
                        )}
                      </>
                    )}
                    
                    {/* Force Confirm Button - always visible for super admins */}
                    {!isCurrentUser && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            disabled={processingUserId === userProfile.user_id}
                          >
                            {processingUserId === userProfile.user_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Confirm
                              </>
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Force Confirm Email?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will manually verify the email for <strong>{userProfile.full_name}</strong> ({userProfile.email}). Use this if the confirmation email failed to send or was lost.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => forceConfirmUser(userProfile.user_id, userProfile.email)}>
                              Confirm User
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 pt-4 border-t">
          <p className="text-sm text-muted-foreground">
            Total Users: {users.length} | Admins: {Array.from(userRoles.values()).filter(r => r.includes('admin')).length}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};