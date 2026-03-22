const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function diagnose() {
  console.log('--- DETAILED DIAGNOSIS ---');
  
  // 1. Check Registry for Nova Cordova and Abedi
  const { data: registry, error: regError } = await supabase.from('artist_registry').select('*');
  if (regError) console.error('Registry Error:', regError);
  
  const relevantRegistry = registry?.filter(a => 
    a.artist_name.toLowerCase().includes('nova') || 
    a.artist_name.toLowerCase().includes('abedi')
  );
  console.log('\n[Relevant Registry Entries]:', JSON.stringify(relevantRegistry, null, 2));

  // 2. Check Global Analyses
  const { data: analyses, error: anaError } = await supabase.from('global_analyses').select('*');
  if (anaError) console.error('Analyses Error:', anaError);

  const relevantAnalyses = analyses?.filter(a => 
    a.artist_name.toLowerCase().includes('nova') || 
    a.artist_name.toLowerCase().includes('abedi')
  );
  console.log('\n[Relevant Global Analyses]:', JSON.stringify(relevantAnalyses, null, 2));

  // 3. Check Current User (latest updated)
  const { data: latestUser } = await supabase.from('users').select('*').order('updated_at', { ascending: false }).limit(1);
  console.log('\n[Latest Active User]:', JSON.stringify(latestUser, null, 2));
}

diagnose();
