import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function purge() {
  const { data, error } = await supabase.from('users').delete().neq('id', 'non-existent-id');
  if (error) {
    console.error('Failed to purge:', error);
  } else {
    console.log('Database users table purged successfully.');
  }
}

purge();
