/**
 * One-time generator for src/lib/pa-counties-geo.json: fetches US census
 * county GeoJSON (via the plotly mirror), keeps Pennsylvania (FIPS 42xxx),
 * projects lon/lat to a 960x600 viewBox with a plate carree projection
 * (fine at PA's scale), and emits an SVG path per county.
 *
 *   npx tsx scripts/dev/build-county-geometry.ts
 */
import { writeFileSync } from "node:fs";

const SOURCE =
  "https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json";

type Ring = [number, number][];
type Feature = {
  properties: { NAME: string };
  id: string;
  geometry:
    | { type: "Polygon"; coordinates: Ring[] }
    | { type: "MultiPolygon"; coordinates: Ring[][] };
};

const WIDTH = 960;
const HEIGHT = 600;

async function main() {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`${res.status} fetching ${SOURCE}`);
  const geo = (await res.json()) as { features: Feature[] };

  const pa = geo.features.filter((f) => f.id.startsWith("42"));
  if (pa.length !== 67) throw new Error(`expected 67 PA counties, got ${pa.length}`);

  const polys = (f: Feature): Ring[][] =>
    f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;

  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const f of pa)
    for (const poly of polys(f))
      for (const ring of poly)
        for (const [lon, lat] of ring) {
          minLon = Math.min(minLon, lon);
          maxLon = Math.max(maxLon, lon);
          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
        }

  // Correct east-west stretch at PA's mid latitude, then fit the viewBox.
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const lonScale = Math.cos(midLat);
  const spanX = (maxLon - minLon) * lonScale;
  const spanY = maxLat - minLat;
  const scale = Math.min((WIDTH - 20) / spanX, (HEIGHT - 20) / spanY);
  const xOff = (WIDTH - spanX * scale) / 2;
  const yOff = (HEIGHT - spanY * scale) / 2;

  const px = (lon: number) => xOff + (lon - minLon) * lonScale * scale;
  const py = (lat: number) => yOff + (maxLat - lat) * scale;

  const counties = pa
    .map((f) => {
      const path = polys(f)
        .map((poly) =>
          poly
            .map(
              (ring) =>
                "M" +
                ring
                  .map(([lon, lat]) => `${px(lon).toFixed(1)},${py(lat).toFixed(1)}`)
                  .join("L") +
                "Z"
            )
            .join("")
        )
        .join("");
      return { name: f.properties.NAME, path };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const out = { width: WIDTH, height: HEIGHT, counties };
  writeFileSync("src/lib/pa-counties-geo.json", JSON.stringify(out));
  console.log(
    `wrote src/lib/pa-counties-geo.json (${counties.length} counties, ${JSON.stringify(out).length} bytes)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
