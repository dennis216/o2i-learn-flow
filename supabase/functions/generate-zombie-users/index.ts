import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// STRICT SINGLE-SUPER-ADMIN POLICY
// Hard-coded super admin email - this is the ONLY valid super admin
const SUPER_ADMIN_EMAIL = 'ziquanwang52@gmail.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Arrays for generating realistic names
const firstNames = [
  'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Mason',
  'Isabella', 'William', 'Mia', 'James', 'Charlotte', 'Benjamin', 'Amelia',
  'Lucas', 'Harper', 'Henry', 'Evelyn', 'Alexander', 'Abigail', 'Michael',
  'Emily', 'Daniel', 'Elizabeth', 'Jacob', 'Sofia', 'Logan', 'Avery', 'Jackson',
  'Ella', 'Sebastian', 'Scarlett', 'Jack', 'Grace', 'Aiden', 'Chloe', 'Owen',
  'Victoria', 'Samuel', 'Riley', 'Ryan', 'Aria', 'Nathan', 'Lily', 'Carter',
  'Aurora', 'Caleb', 'Zoey', 'Dylan', 'Penelope', 'Luke', 'Layla', 'Gabriel',
  'Nora', 'Anthony', 'Camila', 'Isaac', 'Hannah', 'Grayson', 'Lillian', 'Jack',
  'Addison', 'Julian', 'Brooklyn', 'Levi', 'Eleanor', 'Christopher', 'Savannah',
  'Joshua', 'Aubrey', 'Andrew', 'Stella', 'Lincoln', 'Natalie', 'Mateo', 'Zoe'
];

const lastNames = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker',
  'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
  'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell',
  'Carter', 'Roberts', 'Chen', 'Kim', 'Patel', 'Singh', 'Wang', 'Li', 'Zhang'
];

const emailDomains = [
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com',
  'protonmail.com', 'mail.com', 'aol.com'
];

function getRandomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateRandomNumber(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateZombieUser() {
  const firstName = getRandomElement(firstNames);
  const lastName = getRandomElement(lastNames);
  const fullName = `${firstName} ${lastName}`;
  
  // Generate a unique email with random numbers
  const randomNum = generateRandomNumber(1, 9999);
  const emailPrefix = `${firstName.toLowerCase()}${lastName.toLowerCase()}${randomNum}`;
  const emailDomain = getRandomElement(emailDomains);
  const email = `${emailPrefix}@${emailDomain}`;
  
  return {
    user_id: null, // Zombie users don't have auth.users entries
    full_name: fullName,
    email: email,
    is_zombie: true,
    role: 'student'
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('Starting zombie user generation...');
    
    // SECURITY: Require authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('Rejected: Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Create client with user's token to verify their identity
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get the caller's user info
    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) {
      console.log('Rejected: Invalid authorization token');
      return new Response(
        JSON.stringify({ error: 'Invalid authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CODE-LEVEL LOGIC SHIELD: Only the designated super admin email can use this function
    if (caller.email?.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase()) {
      console.log(`Rejected: User ${caller.email} is not the designated Super Admin`);
      return new Response(
        JSON.stringify({ error: 'Only the designated Super Admin can generate zombie users' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Authorized: Super Admin ${caller.email} generating zombie users`);

    // Use service role client for admin operations (now authorized)
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Generate 7 zombie users
    const zombieUsers = [];
    for (let i = 0; i < 7; i++) {
      zombieUsers.push(generateZombieUser());
    }

    console.log('Generated zombie users:', zombieUsers.map(u => u.email));

    // Insert the zombie users into the profiles table
    const { data, error } = await supabase
      .from('profiles')
      .insert(zombieUsers)
      .select();

    if (error) {
      console.error('Error inserting zombie users:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Successfully created zombie users:', data?.length);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Created ${data?.length || 0} zombie users`,
        users: data?.map(u => ({ name: u.full_name, email: u.email }))
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Zombie generation error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
