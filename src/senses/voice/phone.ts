export function normalizeTwilioE164PhoneNumber(value: string | undefined): string | undefined {
  const raw = value?.trim()
  if (!raw) return undefined
  if (raw.toLowerCase().startsWith("group:")) return undefined
  const cleaned = raw.replace(/[^\d+]+/g, "")
  if (/^\+[1-9]\d{6,14}$/.test(cleaned)) return cleaned
  const digits = cleaned.replace(/\D+/g, "")
  if (/^1\d{10}$/.test(digits)) return `+${digits}`
  if (/^\d{10}$/.test(digits)) return `+1${digits}`
  return undefined
}
