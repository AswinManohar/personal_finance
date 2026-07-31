const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://ognusjgoyvhihypbtgvl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbnVzamdveXZoaWh5cGJ0Z3ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1NzY3MzMsImV4cCI6MjA4NDE1MjczM30.G4Ic-Ozv7VWo-xFoMsEWCs1GwnKD-L_amEbEPefi8A8'
);

async function test() {
  const { data, error } = await supabase.from('user_income').select('*').limit(1);
  console.log('Select:', data, error);
}

test();
