import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { groupTeamMembers } from "@/lib/teamDepartments";
import { Badge } from "@/components/ui/badge";
import { Users, Crown, Shield } from "lucide-react";

interface TeamMember {
  id: string;
  name: string;
  roles: string[];
  bio: string | null;
  photo_url: string | null;
  order_index: number;
  departments: string[];
}

const TeamMemberCard = ({ member }: { member: TeamMember }) => (
  <Card className="overflow-hidden group hover:shadow-lg transition-shadow duration-300">
    <div className="flex justify-center pt-8 pb-4">
      {member.photo_url ? (
        <img
          src={member.photo_url}
          alt={member.name}
          className="w-32 h-32 rounded-2xl object-cover shadow-md group-hover:scale-105 transition-transform duration-300"
        />
      ) : (
        <div className="w-32 h-32 rounded-2xl flex items-center justify-center shadow-md bg-gradient-to-br from-[#4A90E2]/30 to-[#4A90E2]/10">
          <span className="text-5xl font-bold" style={{ color: "#4A90E2" }}>
            {member.name.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
    </div>
    <CardContent className="p-6 text-center">
      <h3 className="text-xl font-semibold mb-1">{member.name}</h3>
      <p className="text-sm font-medium mb-2" style={{ color: "#4A90E2" }}>
        {member.roles.join(" · ")}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-1.5 mb-3">
        {member.roles.filter(role => role === "Founder" || role === "Co-founder").map(role => (
          <Badge key={role} className="bg-amber-500/15 text-amber-700 border-amber-300 hover:bg-amber-500/20 text-xs gap-1">
            <Crown className="w-3 h-3" />
            {role}
          </Badge>
        ))}
        {member.roles.includes("Team Leader") && (
          <Badge className="bg-[#4A90E2]/15 text-[#4A90E2] border-[#4A90E2]/30 hover:bg-[#4A90E2]/20 text-xs gap-1">
            <Shield className="w-3 h-3" />
            Team Leader
          </Badge>
        )}
      </div>
      {member.bio && (
        <p className="text-muted-foreground text-sm leading-relaxed">
          {member.bio}
        </p>
      )}
    </CardContent>
  </Card>
);

const Team = () => {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchTeamMembers();
  }, []);

  const fetchTeamMembers = async () => {
    setLoading(true);
    setError(false);
    try {
      const { data, error } = await supabase
        .from("team_members")
        .select("*")
        .order("order_index", { ascending: true });

      if (error) throw error;
      setTeamMembers(data || []);
    } catch (error) {
      console.error("Error fetching team members:", error);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const groupedMembers = groupTeamMembers(teamMembers);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <Skeleton className="h-10 w-64 mx-auto mb-4" />
          <Skeleton className="h-6 w-96 mx-auto" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="h-64 w-full" />
              <CardContent className="p-6">
                <Skeleton className="h-6 w-32 mb-2" />
                <Skeleton className="h-4 w-24 mb-4" />
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
          <Users className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-4xl font-bold mb-4">Meet the Team</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Our dedicated team of educators and math enthusiasts are here to help you succeed in your mathematical journey.
        </p>
      </div>

      {/* Grouped by Department */}
      {error ? (
        <div role="alert" className="space-y-3 py-16 text-center">
          <p>Could not load team members. Please try again.</p>
          <Button type="button" onClick={() => void fetchTeamMembers()}>Retry</Button>
        </div>
      ) : groupedMembers.leadership.length === 0 && groupedMembers.departments.length === 0 ? (
        <div className="text-center py-16">
          <Users className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
          <h2 className="text-xl font-semibold text-muted-foreground mb-2">
            Team information coming soon
          </h2>
          <p className="text-muted-foreground">
            Check back later to meet our amazing team!
          </p>
        </div>
      ) : (
        <div className="space-y-12">
          {groupedMembers.leadership.length > 0 && (
            <section>
              <h2
                className="text-2xl font-bold mb-6 pb-2 border-b-2"
                style={{ color: "#B87503", borderColor: "#E8B94C" }}
              >
                Leadership
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {groupedMembers.leadership.map(member => <TeamMemberCard key={member.id} member={member} />)}
              </div>
            </section>
          )}
          {groupedMembers.departments.map((department) => (
            <section key={department.department}>
              <h2
                className="text-2xl font-bold mb-6 pb-2 border-b-2"
                style={{ color: "#4A90E2", borderColor: "#4A90E2" }}
              >
                {department.department}
              </h2>
              {department.members.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {department.members.map(member => <TeamMemberCard key={member.id} member={member} />)}
                </div>
              )}
              {department.groups.map(group => (
                <div key={group.group} className="mt-8">
                  <h3 className="text-xl font-semibold mb-5">{group.group}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {group.members.map(member => <TeamMemberCard key={member.id} member={member} />)}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default Team;
