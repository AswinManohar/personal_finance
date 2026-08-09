const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://ognusjgoyvhihypbtgvl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbnVzamdveXZoaWh5cGJ0Z3ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1NzY3MzMsImV4cCI6MjA4NDE1MjczM30.G4Ic-Ozv7VWo-xFoMsEWCs1GwnKD-L_amEbEPefi8A8'
);

// Add auth header for the RLS policy (using the actual user key from earlier: '1f9aae56-9b4c-440b-9e95-26965c86ed77')
// Wait, the client is initialized with ANON key, but how does it authenticate the user?
