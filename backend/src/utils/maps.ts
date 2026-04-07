import axios from 'axios';
export interface LatLng { lat: number; lng: number; }
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  try {
    const res = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', { params: { address, key: process.env.GOOGLE_MAPS_API_KEY, region: 'in' } });
    if (res.data.status !== 'OK') return null;
    return res.data.results[0].geometry.location;
  } catch { return null; }
}
export async function resolvePincode(pincode: string): Promise<{ city: string; locality: string } | null> {
  try {
    const res = await axios.get(`https://api.postalpincode.in/pincode/${pincode}`);
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
