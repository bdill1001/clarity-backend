import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function purge() {
  const { data, error } = await supabase.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) {
    console.error('Failed to purge:', error);
  } else {
    console.log('Database users table purged successfully.');
  }
}

purge();
