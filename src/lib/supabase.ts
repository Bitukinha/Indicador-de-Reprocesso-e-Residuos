import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase env vars ausentes: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
