import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";

interface TeamMember {
  id: string;
  name: string;
  role: string;
  bio: string | null;
  photo_url: string | null;
  order_index: number;
  department: string;
}

const DEPARTMENT_ORDER = [
  "Publicity",
  "Web Development & Management",
  "Curriculum Content & Production",
];

const DEPARTMENT_LABELS: Record<string, string> = {
  "Publicity": "宣传队伍 — Publicity Team",
  "Web Development & Management": "网站开发与管理队伍 — Web Development & Management Team",
  "Curriculum Content & Production": "课程内容与录制队伍 — Curriculum Content & Production Team",
};

const Team = () => {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTeamMembers();
  }, []);

  const fetchTeamMembers = async () => {
    try {
      const { data, error } = await supabase
        .from("team_members")
        .select("*")
        .order("order_index", { ascending: true });

      if (error) throw error;
      setTeamMembers(data || []);
    } catch (error) {
      console.error("Error fetching team members:", error);
    } finally {
      setLoading(false);
    }
  };

  const groupedMembers = DEPARTMENT_ORDER.map((dept) => ({
    department: dept,
    label: DEPARTMENT_LABELS[dept] || dept,
    members: teamMembers.filter((m) => m.department === dept),
  })).filter((g) => g.members.length > 0);

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
      {groupedMembers.length === 0 ? (
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
          {groupedMembers.map((group) => (
            <section key={group.department}>
              <h2
                className="text-2xl font-bold mb-6 pb-2 border-b-2"
                style={{ color: "#4A90E2", borderColor: "#4A90E2" }}
              >
                {group.label}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {group.members.map((member) => (
                  <Card
                    key={member.id}
                    className="overflow-hidden group hover:shadow-lg transition-shadow duration-300"
                  >
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
                      <p className="text-sm font-medium mb-3" style={{ color: "#4A90E2" }}>
                        {member.role}
                      </p>
                      {member.bio && (
                        <p className="text-muted-foreground text-sm leading-relaxed">
                          {member.bio}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default Team;
