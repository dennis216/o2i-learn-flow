import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Secret for API access - loaded from environment variable
const API_SECRET = Deno.env.get('ZOMBIE_USERS_SECRET');

if (!API_SECRET) {
  console.error('ZOMBIE_USERS_SECRET environment variable is not configured');
}

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
  
  const randomNum = generateRandomNumber(1, 9999);
  const emailPrefix = `${firstName.toLowerCase()}${lastName.toLowerCase()}${randomNum}`;
  const emailDomain = getRandomElement(emailDomains);
  const email = `${emailPrefix}@${emailDomain}`;
  
  return {
    user_id: null,
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
    console.log('=== ZOMBIE USER GENERATION STARTED ===');
    console.log('Request method:', req.method);
    
    // Verify secret is configured
    if (!API_SECRET) {
      console.error('ZOMBIE_USERS_SECRET not configured');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: Secret not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Check for secret in query parameter
    const url = new URL(req.url);
    const providedSecret = url.searchParams.get('secret');
    
    console.log('Secret provided:', !!providedSecret);
    
    if (providedSecret !== API_SECRET) {
      console.log('Invalid or missing secret');
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid or missing secret' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    }
    
    console.log('Secret verified successfully');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    console.log('SUPABASE_URL available:', !!supabaseUrl);
    console.log('SUPABASE_SERVICE_ROLE_KEY available:', !!supabaseServiceKey);

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing required environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
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

    console.log('=== ZOMBIE USERS TO CREATE ===');
    console.log('Count:', zombieUsers.length);
    console.log('Users:', JSON.stringify(zombieUsers, null, 2));

    // Insert the zombie users into the profiles table
    console.log('Inserting into profiles table...');
    const { data, error } = await supabase
      .from('profiles')
      .insert(zombieUsers)
      .select();

    if (error) {
      console.error('=== INSERT ERROR ===');
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      console.error('Error details:', error.details);
      console.error('Error hint:', error.hint);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('=== INSERT SUCCESS ===');
    console.log('Created users count:', data?.length);
    console.log('Created users:', JSON.stringify(data, null, 2));

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Created ${data?.length || 0} zombie users`,
        users: data?.map(u => ({ name: u.full_name, email: u.email }))
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('=== UNEXPECTED ERROR ===');
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
