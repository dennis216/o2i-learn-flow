interface SupabaseClientConfig {
  url: string;
  anonKey: string;
}

/** Keep the published client unchanged; opt in to an explicitly local dev client. */
export function resolveSupabaseClientConfig(
  published: SupabaseClientConfig,
  dev: boolean,
  localUrl?: string,
  localAnonKey?: string,
): SupabaseClientConfig {
  if (!dev || (!localUrl && !localAnonKey)) return published;
  if (!localUrl || !localAnonKey) {
    throw new Error("Local Supabase requires both VITE_LOCAL_SUPABASE_URL and VITE_LOCAL_SUPABASE_ANON_KEY");
  }

  const parsedUrl = new URL(localUrl);
  if (parsedUrl.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(parsedUrl.hostname)) {
    throw new Error("Local Supabase URL must use HTTP on this computer's loopback address");
  }

  try {
    const payload = JSON.parse(atob(localAnonKey.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.role !== "anon") throw new Error("not anon");
  } catch {
    throw new Error("Local Supabase browser key must be an anon JWT, never a service-role or secret key");
  }

  return { url: parsedUrl.origin, anonKey: localAnonKey };
}
