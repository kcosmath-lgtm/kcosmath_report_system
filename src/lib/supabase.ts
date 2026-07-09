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

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  if (isMissingKeys) {
    return defaultValue;
  }
  try {
    const { data, error } = await supabase
      .from("cosmath_settings")
      .select("value")
      .eq("key", key)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return defaultValue;
      }
      console.error(`Error fetching key ${key} from Supabase:`, error);
      return defaultValue;
    }

    return (data?.value as T) ?? defaultValue;
  } catch (err) {
    console.error(`Exception fetching key ${key} from Supabase:`, err);
    return defaultValue;
  }
}

export async function saveSetting<T>(key: string, value: T): Promise<boolean> {
  if (isMissingKeys) {
    return false;
  }
  try {
    const { error } = await supabase
      .from("cosmath_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

    if (error) {
      console.error(`Error saving key ${key} to Supabase:`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Exception saving key ${key} to Supabase:`, err);
    return false;
  }
}
