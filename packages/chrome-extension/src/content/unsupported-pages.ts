export function unsupportedPageReason(url: string): 'UNSUPPORTED_PAGE' | undefined {
  if (url.startsWith('chrome://')) return 'UNSUPPORTED_PAGE'
  if (url.startsWith('chrome-extension://')) return 'UNSUPPORTED_PAGE'
  if (url.startsWith('devtools://')) return 'UNSUPPORTED_PAGE'
  if (url.startsWith('file://')) return 'UNSUPPORTED_PAGE'
  if (url.startsWith('about:')) return 'UNSUPPORTED_PAGE'
  if (url.startsWith('data:')) return 'UNSUPPORTED_PAGE'
  if (url.startsWith('blob:')) return 'UNSUPPORTED_PAGE'
  return undefined
}
