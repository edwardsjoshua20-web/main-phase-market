export function getEnv(name: string, fallback = '') {
  return String(Deno.env.get(name) || fallback || '').trim();
}

export function requireEnv(name: string) {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}
