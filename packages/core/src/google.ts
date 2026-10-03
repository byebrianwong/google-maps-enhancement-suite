// Reading Google Maps place links, and making links back to Google Maps.
//
// A place page URL looks like this (taken from Google Maps in October 2026):
//
//   https://www.google.com/maps/place/Mission+Dolores+Park/@37.76,-122.42,17z
//     /data=!3m1!4b1!4m6!3m5!1s0x808f7e1779aa70a7:0xa618e4eff1228d60
//     !8m2!3d37.7602015!4d-122.4267959!16zL20vMDN6eXNz?entry=ttu
//
// - the path segment after /place/ is the place name
// - !1s<hex>:<hex> is Google's feature id for the place. It is stable, and
//   the second half is the "cid" that https://maps.google.com/?cid= accepts
// - !3d<lat>!4d<lng> is the place's own location. The @lat,lng part is only
//   where the map is centred
// - !19s<ChIJ...> is the Places API place id. It appears on links clicked
//   from search results, not on every URL
//
// None of this is a documented format, so every field is optional and the
// parser returns null rather than guessing when the basics are missing.

export type GooglePlaceRef = {
  name: string;
  lat: number;
  lng: number;
  fid: string | null; // "0x808f7e1779aa70a7:0xa618e4eff1228d60"
  cid: string | null; // decimal form of the second half of fid
  placeId: string | null; // "ChIJ..." when present
  approximate: boolean; // true if lat/lng came from the map centre
};

const NUM = "(-?\\d+(?:\\.\\d+)?)";

export function fidToCid(fid: string): string | null {
  const m = /^0x[0-9a-f]+:0x([0-9a-f]+)$/i.exec(fid);
  if (!m) return null;
  return BigInt(`0x${m[1]}`).toString(10);
}

export function parseGoogleMapsUrl(href: string): GooglePlaceRef | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (!/(^|\.)google\.[a-z.]+$/.test(url.hostname)) return null;
  const pm = /\/maps\/place\/([^/]+)/.exec(url.pathname);
  if (!pm) return null;

  let name: string;
  try {
    name = decodeURIComponent(pm[1].replace(/\+/g, " ")).trim();
  } catch {
    name = pm[1].replace(/\+/g, " ").trim();
  }
  if (!name) return null;

  // The data part sits in the path, after "/data=".
  const data = url.pathname + url.search;
  const fidMatch = /!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i.exec(data);
  const placeIdMatch = /!19s(ChI[A-Za-z0-9_-]+)/.exec(data);
  const loc =
    new RegExp(`!8m2!3d${NUM}!4d${NUM}`).exec(data) ?? new RegExp(`!3d${NUM}!4d${NUM}`).exec(data);

  let lat: number;
  let lng: number;
  let approximate = false;
  if (loc) {
    lat = Number(loc[1]);
    lng = Number(loc[2]);
  } else {
    const at = new RegExp(`@${NUM},${NUM}`).exec(url.pathname);
    if (!at) return null;
    lat = Number(at[1]);
    lng = Number(at[2]);
    approximate = true;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const fid = fidMatch ? fidMatch[1].toLowerCase() : null;
  return {
    name,
    lat,
    lng,
    fid,
    cid: fid ? fidToCid(fid) : null,
    placeId: placeIdMatch ? placeIdMatch[1] : null,
    approximate,
  };
}

// A link that opens this exact place in Google Maps, on the web or in the app.
export function googleMapsPlaceUrl(ref: { fid?: string | null; name: string; lat: number; lng: number }): string {
  const cid = ref.fid ? fidToCid(ref.fid) : null;
  if (cid) return `https://maps.google.com/?cid=${cid}`;
  // Not linked yet: search for the name around the place's location.
  return `https://www.google.com/maps/search/${encodeURIComponent(ref.name)}/@${ref.lat},${ref.lng},16z`;
}
