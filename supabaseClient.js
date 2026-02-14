import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://ggvfkeerwjnpgxhmatcv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_bJ8i_s76NqzLMkUb1uzGog_FyU3p16B";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
