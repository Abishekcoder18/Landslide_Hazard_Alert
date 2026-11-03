/** Read a design token (defined once in src/index.css @theme) for canvas/SVG code such as Leaflet layers. */
export function token(name: string): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim();
}
