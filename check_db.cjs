const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ezinpkzlpszzztkcozud.supabase.co';
const supabaseKey = 'sb_publishable_Xhp2s62tWwhC6M49p6w_aw_2X2362iI'; // Wait, it's publishable. Let's see if we can read tables

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Querying versions...');
  const { data: versions, error: vErr } = await supabase.from('versions').select('*');
  if (vErr) {
    console.error('Error fetching versions:', vErr);
    return;
  }
  console.log('Versions in DB:', versions);

  for (const table of ['products', 'customers', 'orders']) {
    console.log(`\nQuerying ${table}...`);
    const { data, error } = await supabase.from(table).select('id, version_id');
    if (error) {
      console.error(`Error fetching ${table}:`, error);
      continue;
    }
    console.log(`Total rows in ${table}: ${data.length}`);
    const counts = {};
    for (const r of data) {
      counts[r.version_id] = (counts[r.version_id] || 0) + 1;
    }
    console.log(`Rows per version_id:`, counts);
  }
}

run();
