export const MAX_GAME_BYTES = 5 * 1024 * 1024;
export function validateGameFile(file: { name: string; size: number }) {
  if (!/\.html$/i.test(file.name) || file.size < 1 || file.size > MAX_GAME_BYTES) throw new Error('Choose a non-empty .html file up to 5 MiB.');
}
// Opaque iframe origin + CSP: scripts run, but never with the host site's credentials or storage.
export function gameDocument(html: string) {
  const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
  return '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + policy + '"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + html + '</body></html>';
}
