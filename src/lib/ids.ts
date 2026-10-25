const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/**
 * PocketBase-compatible record id (15 chars, a-z0-9), so records can be created offline
 * and pushed later under the same id.
 */
export function newRecordId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(15))
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('')
}

export const isRecordId = (id: string): boolean => /^[a-z0-9]{15}$/.test(id)
