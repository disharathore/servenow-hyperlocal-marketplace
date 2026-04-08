import axios from 'axios';
export interface LatLng { lat: number; lng: number; }

const EXTERNAL_HTTP_TIMEOUT_MS = 4000;

export async function geocodeAddress(address: string): Promise<LatLng | null> {
  try {
    const res = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: { address, key: process.env.GOOGLE_MAPS_API_KEY, region: 'in' },
      timeout: EXTERNAL_HTTP_TIMEOUT_MS,
    });
    if (res.data.status !== 'OK') return null;
    return res.data.results[0].geometry.location;
  } catch { return null; }
}
export async function resolvePincode(pincode: string): Promise<{ city: string; locality: string } | null> {
  try {
    const res = await axios.get(`https://api.postalpincode.in/pincode/${pincode}`, {
      timeout: EXTERNAL_HTTP_TIMEOUT_MS,
    });
    if (res.data[0]?.Status !== 'Success') return null;
    const post = res.data[0].PostOffice[0];
    return { city: post.District, locality: post.Name };
  } catch { return null; }
}
export function getDistanceKm(a: LatLng, b: LatLng): number {
  const R = 6371, dLat = ((b.lat-a.lat)*Math.PI)/180, dLng = ((b.lng-a.lng)*Math.PI)/180;
  const h = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}

export async function getEtaAndRoute(origin: LatLng, destination: LatLng): Promise<{ eta_text: string | null; eta_seconds: number | null; route_polyline: string | null; distance_text: string | null }> {
  try {
    const res = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
      params: {
        origin: `${origin.lat},${origin.lng}`,
        destination: `${destination.lat},${destination.lng}`,
        mode: 'driving',
        key: process.env.GOOGLE_MAPS_API_KEY,
      },
      timeout: 7000,
    });

    if (res.data?.status !== 'OK' || !res.data?.routes?.[0]?.legs?.[0]) {
      return { eta_text: null, eta_seconds: null, route_polyline: null, distance_text: null };
    }

    const leg = res.data.routes[0].legs[0];
    return {
      eta_text: leg.duration?.text || null,
      eta_seconds: leg.duration?.value || null,
      route_polyline: res.data.routes[0].overview_polyline?.points || null,
      distance_text: leg.distance?.text || null,
    };
  } catch {
    return { eta_text: null, eta_seconds: null, route_polyline: null, distance_text: null };
  }
}
