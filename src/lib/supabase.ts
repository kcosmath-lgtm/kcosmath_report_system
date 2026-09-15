import { createClient } from "@supabase/supabase-js";

const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-url-for-build.supabase.co";
// URL 끝에 /rest/v1 이나 /rest/v1/ 이 붙어있는 경우 이를 제거하여 중복 경로 발생을 방지합니다.
const supabaseUrl = rawSupabaseUrl.replace(/\/rest\/v1\/?$/, "");
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key-for-build";

const isMissingKeys = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (isMissingKeys && typeof window !== "undefined") {
  console.warn(
    "Supabase environment variables are missing. Please define NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
