export type DeviceKind = 'mobile' | 'tablet' | 'mac' | 'pc' | 'unknown'

export function parseDeviceFromUserAgent(ua: string | null | undefined): DeviceKind {
  if (!ua?.trim()) return 'unknown'

  const s = ua.toLowerCase()

  if (/ipad|tablet|kindle|playbook|silk/.test(s)) return 'tablet'
  if (/android/.test(s) && !/mobile/.test(s)) return 'tablet'

  if (
    /iphone|ipod|android.*mobile|windows phone|blackberry|opera mini|mobile safari|mobile/.test(s)
  ) {
    return 'mobile'
  }

  if (/macintosh|mac os x/.test(s)) return 'mac'

  if (/windows|linux|cros|ubuntu|fedora|x11/.test(s)) return 'pc'

  return 'unknown'
}

export function deviceLabel(kind: DeviceKind | string | null | undefined): string | null {
  switch (kind) {
    case 'mobile':
      return 'Mobile'
    case 'tablet':
      return 'Tablette'
    case 'mac':
      return 'Mac'
    case 'pc':
      return 'PC'
    default:
      return null
  }
}

export function deviceKindFromHeader(request: Request): DeviceKind {
  return parseDeviceFromUserAgent(request.headers.get('user-agent'))
}
