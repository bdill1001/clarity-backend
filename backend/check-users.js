import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function run() {
  const { data, error } = await supabase.from('users').select('*');
  if (error) {
    console.error('Error fetching users:', error);
    return;
  }
  
  console.log(`Found ${data.length} users.`);
  for (const u of data) {
    console.log(`User ID: ${u.id}`);
    console.log(`  Active: ${u.is_active}`);
    console.log(`  Push Token: ${u.expo_push_token ? 'Present' : 'NULL'}`);
    console.log(`  Has Access Token: ${!!u.access_token}`);
    console.log(`  Has Refresh Token: ${!!u.refresh_token}`);
    console.log(`  Last Analyzed Track: ${u.last_analyzed_track_id}`);
    console.log(`  Updated At: ${u.updated_at}`);
  }
}

run();
