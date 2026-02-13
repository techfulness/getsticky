/** Mask an API key for safe display */
export function maskApiKey(key: string): string {
  return key.length > 12 ? key.slice(0, 7) + '...' + key.slice(-4) : '****';
}
