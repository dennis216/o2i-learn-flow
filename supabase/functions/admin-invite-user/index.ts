import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const allowedRoles = new Set(["student", "instructor", "admin"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Invalid authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerIsSuperAdmin, error: roleError } = await userClient.rpc("is_super_admin", {
      _user_id: caller.id,
    });
    if (roleError || callerIsSuperAdmin !== true) {
      return new Response(JSON.stringify({ error: "Only the Top Admin can invite accounts" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, fullName, role } = await req.json();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedName = String(fullName || "").trim();
    const normalizedRole = String(role || "student");

    if (!normalizedEmail || !normalizedEmail.includes("@") || !normalizedName) {
      return new Response(JSON.stringify({ error: "A valid name and email are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!allowedRoles.has(normalizedRole)) {
      return new Response(JSON.stringify({ error: "Unsupported account type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: invitation, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      normalizedEmail,
      { data: { full_name: normalizedName } },
    );
    if (inviteError || !invitation.user) {
      throw inviteError || new Error("Invitation could not be created");
    }

    const { error: assignmentError } = await adminClient.from("user_roles").insert({
      user_id: invitation.user.id,
      role: normalizedRole,
    });
    if (assignmentError) throw assignmentError;

    return new Response(JSON.stringify({
      success: true,
      user: { id: invitation.user.id, email: normalizedEmail, role: normalizedRole },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to invite account";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
