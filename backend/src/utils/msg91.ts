import axios from 'axios';
export async function sendOtp(phone: string): Promise<boolean> {
  try {
    const formatted = phone.startsWith('91') ? phone : `91${phone}`;
    const res = await axios.post('https://api.msg91.com/api/v5/otp', { template_id: process.env.MSG91_TEMPLATE_ID, mobile: formatted, authkey: process.env.MSG91_AUTH_KEY, otp_expiry: 5, otp_length: 6 }, { headers: { 'Content-Type': 'application/json' } });
    return res.data?.type === 'success';
  } catch { return false; }
}
export async function verifyOtp(phone: string, otp: string): Promise<boolean> {
  try {
    const formatted = phone.startsWith('91') ? phone : `91${phone}`;
    const res = await axios.get('https://api.msg91.com/api/v5/otp/verify', { params: { authkey: process.env.MSG91_AUTH_KEY, mobile: formatted, otp } });
    return res.data?.type === 'success';
  } catch { return false; }
}
