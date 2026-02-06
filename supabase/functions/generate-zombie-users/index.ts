 import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
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
   
   // Generate a fake user_id (UUID format)
   const userId = crypto.randomUUID();
   
   return {
     user_id: userId,
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
     
     const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
     const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 
     // Use service role client for admin operations
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