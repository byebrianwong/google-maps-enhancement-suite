import assert from "node:assert/strict";
import { test } from "node:test";
import { fidToCid, googleMapsPlaceUrl, parseGoogleMapsUrl } from "./google";

// Real URLs copied from Google Maps on 2026-10-03.
const DOLORES =
  "https://www.google.com/maps/place/Mission+Dolores+Park/@37.7602015,-122.4267959,17z/data=!3m1!4b1!4m6!3m5!1s0x808f7e1779aa70a7:0xa618e4eff1228d60!8m2!3d37.7602015!4d-122.4267959!16zL20vMDN6eXNz?entry=ttu&g_ep=EgoyMDI2MDkzMC4wIKXMDSoASAFQAw%3D%3D";
const CORONA =
  "https://www.google.com/maps/place/Corona+Heights+Dog+Run/@37.7653491,-122.4401825,17z/data=!3m1!4b1!4m6!3m5!1s0x808f7e020f206785:0xa8ba1cd74c4aefb2!8m2!3d37.7653491!4d-122.4401825!16s%2Fg%2F11fx9gv98t?entry=ttu";
// Clicked from a search results list: no @lat,lng, but has the Places API id.
const PINE_LAKE =
  "https://www.google.com/maps/place/Dog+Park+%7C+Pine+Lake+Park/data=!4m7!3m6!1s0x808f7d99a666cae9:0xbb67d13ed556920e!8m2!3d37.736504!4d-122.4832379!16s%2Fg%2F11ckr684d6!19sChIJ6cpmppl9j4ARDpJW1T7RZ7s?authuser=0&hl=en&rclk=1";
const SEARCH =
  "https://www.google.com/maps/search/dog+parks+near+San+Francisco/@37.7381686,-122.4376989,12z/data=!3m1!4b1?entry=ttu";

test("reads name, location and ids from a place page URL", () => {
  assert.deepEqual(parseGoogleMapsUrl(DOLORES), {
    name: "Mission Dolores Park",
    lat: 37.7602015,
    lng: -122.4267959,
    fid: "0x808f7e1779aa70a7:0xa618e4eff1228d60",
    cid: "11968567728930983264",
    placeId: null,
    approximate: false,
  });
  assert.equal(parseGoogleMapsUrl(CORONA)?.name, "Corona Heights Dog Run");
});

test("reads a search-result link with an encoded name and a place id", () => {
  const ref = parseGoogleMapsUrl(PINE_LAKE);
  assert.equal(ref?.name, "Dog Park | Pine Lake Park");
  assert.equal(ref?.lat, 37.736504);
  assert.equal(ref?.lng, -122.4832379);
  assert.equal(ref?.placeId, "ChIJ6cpmppl9j4ARDpJW1T7RZ7s");
  assert.equal(ref?.approximate, false);
});

test("falls back to the map centre when the place location is missing", () => {
  const ref = parseGoogleMapsUrl("https://www.google.com/maps/place/Somewhere/@37.5,-122.25,15z");
  assert.equal(ref?.lat, 37.5);
  assert.equal(ref?.approximate, true);
  assert.equal(ref?.fid, null);
});

test("returns null for pages that are not a single place", () => {
  assert.equal(parseGoogleMapsUrl(SEARCH), null);
  assert.equal(parseGoogleMapsUrl("https://www.google.com/maps/@37.7,-122.4,12z"), null);
  assert.equal(parseGoogleMapsUrl("https://example.com/maps/place/X/@1,2,3z"), null);
  assert.equal(parseGoogleMapsUrl("not a url"), null);
});

test("converts a feature id to the cid Google Maps links accept", () => {
  assert.equal(fidToCid("0x808f7e1779aa70a7:0xa618e4eff1228d60"), "11968567728930983264");
  assert.equal(fidToCid("nonsense"), null);
  assert.equal(
    googleMapsPlaceUrl({ fid: "0x808f7e1779aa70a7:0xa618e4eff1228d60", name: "x", lat: 0, lng: 0 }),
    "https://maps.google.com/?cid=11968567728930983264",
  );
  assert.equal(
    googleMapsPlaceUrl({ fid: null, name: "Dolores Park", lat: 37.76, lng: -122.43 }),
    "https://www.google.com/maps/search/Dolores%20Park/@37.76,-122.43,16z",
  );
});
