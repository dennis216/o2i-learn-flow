import { UserDeletionDialog } from "./UserDeletionDialog";
import { ACCOUNT_ROLES, ACCOUNT_ROLE_LABELS, type ManagedAccountRole } from "@/lib/adminAccess";
import { useState, useEffect } from "react";
import { supabase, SUPABASE_URL } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Shield, ShieldX, Search, UserCog, CheckCircle, Lock, UserPlus } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string | null;
  created_at: string;
}

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : "Unexpected error";


export const UserManagement = () => {
  const { isSuperAdmin, user } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userRoles, setUserRoles] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);
  const [lastSignIns, setLastSignIns] = useState<Map<string, string>>(new Map());
  const [inviting, setInviting] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    fullName: "",
    email: "",
    role: "student" as ManagedAccountRole,
  });

  useEffect(() => {
    if (isSuperAdmin) {
      fetchUsers();
      fetchUserRoles();
      fetchLoginActivity();
    }
  }, [isSuperAdmin]);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, email, role, created_at")
        .eq("is_zombie", false)
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
      (data || []).forEach((ur) => {
        const existing = rolesMap.get(ur.user_id) || [];
        existing.push(ur.role);
        rolesMap.set(ur.user_id, existing);
      });
      setUserRoles(rolesMap);
    } catch (error) {
      console.error("Error fetching user roles:", error);
    }
  };

  const fetchLoginActivity = async () => {
    const { data, error } = await supabase
      .from("user_login_events")
      .select("user_id, signed_in_at")
      .order("signed_in_at", { ascending: false })
      .limit(2000);

    if (error) {
      console.error("Error fetching login activity:", error);
      return;
    }

    const latestByUser = new Map<string, string>();
    (data || []).forEach((event) => {
      if (!latestByUser.has(event.user_id)) {
        latestByUser.set(event.user_id, event.signed_in_at);
      }
    });
    setLastSignIns(latestByUser);
  };

  const inviteManagedAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setInviting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Your session has expired. Please sign in again.");

      const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-invite-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(inviteForm),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to invite account");

      toast({
        title: "Invitation sent",
        description: `${inviteForm.fullName} was invited as ${ACCOUNT_ROLE_LABELS[inviteForm.role]}.`,
      });
      setInviteForm({ fullName: "", email: "", role: "student" });
      await Promise.all([fetchUsers(), fetchUserRoles()]);
    } catch (error: unknown) {
      toast({ title: "Invitation failed", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const changeAccountRole = async (userId: string, role: ManagedAccountRole) => {
    if (!window.confirm(`Change this account to ${ACCOUNT_ROLE_LABELS[role]}? Previous permissions will be replaced.`)) return;
    setProcessingUserId(userId);
    try {
      const { error } = await supabase.rpc('set_account_role', { _user_id: userId, _role: role });
      if (error) throw error;
      await fetchUserRoles();
      toast({ title: 'Account type updated', description: ACCOUNT_ROLE_LABELS[role] });
    } catch (error) {
      toast({ title: 'Update failed', description: getErrorMessage(error), variant: 'destructive' });
    } finally { setProcessingUserId(null); }
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
        `${SUPABASE_URL}/functions/v1/force-confirm-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ userId }),
        }
      );

      const result = await response.json() as { error?: string };

      if (!response.ok) {
        throw new Error(result.error || 'Failed to confirm user');
      }

      toast({ title: "Success", description: `Email confirmed for ${userEmail}` });
    } catch (error: unknown) {
      console.error("Error force confirming user:", error);
      toast({ title: "Error", description: getErrorMessage(error), variant: "destructive" });
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
          Invite accounts and set their access. Only Super Admin can manage users.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={inviteManagedAccount} className="mb-6 rounded-lg border bg-muted/20 p-4">
          <div className="mb-4 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-semibold">Invite an account</h3>
              <p className="text-sm text-muted-foreground">The user receives an email invitation and signs in through the normal login page.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_1.25fr_0.8fr_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="invite-name">Full name</Label>
              <Input id="invite-name" value={inviteForm.fullName} onChange={(event) => setInviteForm({ ...inviteForm, fullName: event.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input id="invite-email" type="email" value={inviteForm.email} onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Account type</Label>
              <Select value={inviteForm.role} onValueChange={(role: ManagedAccountRole) => setInviteForm({ ...inviteForm, role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCOUNT_ROLES.map(role => <SelectItem key={role} value={role}>{ACCOUNT_ROLE_LABELS[role]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={inviting}>
              {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send invite"}
            </Button>
          </div>
        </form>

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

        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left p-3 font-semibold text-sm">User</th>
                <th className="text-left p-3 font-semibold text-sm">Roles</th>
                <th className="text-left p-3 font-semibold text-sm">Joined</th>
                <th className="text-left p-3 font-semibold text-sm">Last sign-in</th>
                <th className="text-right p-3 font-semibold text-sm">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y max-h-[500px] overflow-y-auto">
          {filteredUsers.length === 0 ? (
            <tr><td colSpan={5} className="text-muted-foreground text-center py-8">No users found</td></tr>
          ) : (
            filteredUsers.map((userProfile, index) => {
              const roles = userRoles.get(userProfile.user_id) || [];
              const isSuperAdminUser = roles.includes('super_admin');
              const accountRole = ACCOUNT_ROLES.filter(role => role !== 'student').find(role => roles.includes(role)) ?? 'student';
              const isCurrentUser = userProfile.user_id === user?.id;
              const showSuperAdminBadge = isSuperAdminUser;

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
                      {showSuperAdminBadge && (
                        <Badge variant="default" className="bg-purple-600">
                          <Shield className="h-3 w-3 mr-1" />
                          Super Admin
                          <Lock className="h-3 w-3 ml-1" />
                        </Badge>
                      )}
                      {!showSuperAdminBadge && <Badge variant={accountRole === 'student' ? 'outline' : 'secondary'}>{ACCOUNT_ROLE_LABELS[accountRole]}</Badge>}
                      {isCurrentUser && (
                        <Badge variant="outline" className="border-primary text-primary">You</Badge>
                      )}
                      {isSuperAdminUser && !isCurrentUser && (
                        <Badge variant="outline" className="border-amber-500 text-amber-500">Protected</Badge>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">
                    {new Date(userProfile.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">
                    {lastSignIns.has(userProfile.user_id)
                      ? new Date(lastSignIns.get(userProfile.user_id)!).toLocaleString()
                      : "Never recorded"}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                    {isSuperAdminUser || isCurrentUser ? (
                      <span className="text-sm text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" />Protected</span>
                    ) : (
                      <Select value={accountRole} disabled={processingUserId === userProfile.user_id} onValueChange={(role: ManagedAccountRole) => void changeAccountRole(userProfile.user_id, role)}>
                        <SelectTrigger className="w-44" aria-label={`Account type for ${userProfile.email}`}><SelectValue /></SelectTrigger>
                        <SelectContent>{ACCOUNT_ROLES.map(role => <SelectItem key={role} value={role}>{ACCOUNT_ROLE_LABELS[role]}</SelectItem>)}</SelectContent>
                      </Select>
                    )}

                    {!isCurrentUser && !isSuperAdminUser && <UserDeletionDialog userId={userProfile.user_id} email={userProfile.email} onDeleted={() => {
                      setUsers(current => current.filter(row => row.user_id !== userProfile.user_id));
                      setUserRoles(current => { const next = new Map(current); next.delete(userProfile.user_id); return next; });
                    }} />}

                    {/* Force Confirm Button - visible for non-protected users */}
                    {!isCurrentUser && !isSuperAdminUser && (
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
            Total Users: {users.length} | Admins: {Array.from(userRoles.values()).filter(r => r.some(role => ['super_admin','admin','course_admin','question_admin'].includes(role))).length}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
