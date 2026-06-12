export function getCountryFromRequest(request: Request): string | null {
  const code =
    request.headers.get('x-vercel-ip-country') ||
    request.headers.get('cf-ipcountry') ||
    request.headers.get('x-country-code')

  if (!code || code === 'XX' || code === 'T1') return null
  return code.toUpperCase()
}
