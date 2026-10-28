import { createClient } from '@supabase/supabase-js';

// The optional upstream character-sharing service is not needed by YYC.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key) : null;
