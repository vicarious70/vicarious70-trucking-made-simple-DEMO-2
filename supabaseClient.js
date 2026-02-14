import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://ggvfkeerwjnpgxhmatcv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "PASTE_YOUR_sb_publishable_KEY_HERE";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
