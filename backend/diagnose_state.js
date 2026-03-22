const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function diagnose() {
  console.log('--- DIAGNOSING SUPABASE STATE ---');
  
  // 1. Check Registry for Nova Cordova and Abedi
  const { data: registry } = await supabase.from('artist_registry').select('*').or('artist_name.ilike.%Nova Cordova%,artist_name.ilike.%Abedi%');
  console.log('\n[Registry Entries]:', JSON.stringify(registry, null, 2));

  // 2. Check Users for Push Tokens
  const { data: users } = await supabase.from('users').select('spotify_id, expo_push_token, is_active, updated_at').limit(5);
  console.log('\n[User Push Tokens]:', JSON.stringify(users, null, 2));

  // 3. Check Global Analyses
  const { data: analyses } = await supabase.from('global_analyses').select('*').or('artist_name.ilike.%Nova Cordova%,artist_name.ilike.%Abedi%');
  console.log('\n[Global Analyses]:', JSON.stringify(analyses, null, 2));
}

diagnose();
