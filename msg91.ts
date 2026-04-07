import axios from 'axios';

const BASE_URL = 'https://api.msg91.com/api/v5';

// Send OTP to an Indian mobile number via MSG91
export async function sendOtp(phone: string): Promise<boolean> {
  try {
    const formattedPhone = phone.startsWith('91') ? phone : `91${phone}`;

    const res = await axios.post(
      `${BASE_URL}/otp`,
      {
        template_id: process.env.MSG91_TEMPLATE_ID,
        mobile: formattedPhone,
        authkey: process.env.MSG91_AUTH_KEY,
        otp_expiry: 5, // minutes
        otp_length: 6,
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    return res.data?.type === 'success';
  } catch (err) {
    console.error('MSG91 sendOtp error:', err);
    return false;
  }
}

// Verify OTP with MSG91
export async function verifyOtp(phone: string, otp: string): Promise<boolean> {
  try {
    const formattedPhone = phone.startsWith('91') ? phone : `91${phone}`;

    const res = await axios.get(`${BASE_URL}/otp/verify`, {
      params: {
        authkey: process.env.MSG91_AUTH_KEY,
        mobile: formattedPhone,
        otp,
      },
    });

    return res.data?.type === 'success';
  } catch (err) {
    console.error('MSG91 verifyOtp error:', err);
    return false;
  }
}
