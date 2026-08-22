const LOCATION_ACCENTS = [
  { accent: "#d65a1f", tile: 'url("/patterns/sessa-maiolica-orange.png")' },
  { accent: "#1f4e79", tile: 'url("/patterns/sessa-maiolica-blue.png")' },
  { accent: "#08c963", tile: 'url("/patterns/sessa-maiolica-green.png")' }
] as const;

const CITY_HERO_BACKGROUNDS = {
  firenze: "/images/sfondo-sedi/firenze.webp",
  milano: "/images/sfondo-sedi/milano.webp",
  roma: "/images/sfondo-sedi/roma.webp",
  torino: "/images/sfondo-sedi/torino.webp",
  vesuvio: "/images/sfondo-sedi/vesuvio1.webp"
} as const;

function normalizeLocationText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\(.+?\)/g, " ");
}

export function getLocationVisual(
  location: { slug: string; name: string; city: string; position?: number },
  cityName: string
) {
  const haystack = normalizeLocationText(`${location.slug} ${location.name} ${location.city} ${cityName}`);
  const background = haystack.includes("milano") || haystack.includes("merlata")
    ? CITY_HERO_BACKGROUNDS.milano
    : haystack.includes("roma")
      ? CITY_HERO_BACKGROUNDS.roma
      : haystack.includes("torino")
        ? CITY_HERO_BACKGROUNDS.torino
        : haystack.includes("firenze")
          ? CITY_HERO_BACKGROUNDS.firenze
          : CITY_HERO_BACKGROUNDS.vesuvio;
  const theme = LOCATION_ACCENTS[Math.max(0, location.position ?? 0) % LOCATION_ACCENTS.length];
  return { ...theme, background };
}
