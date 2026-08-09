import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ognusjgoyvhihypbtgvl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbnVzamdveXZoaWh5cGJ0Z3ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1NzY3MzMsImV4cCI6MjA4NDE1MjczM30.G4Ic-Ozv7VWo-xFoMsEWCs1GwnKD-L_amEbEPefi8A8';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log("Supabase client initialized.");
