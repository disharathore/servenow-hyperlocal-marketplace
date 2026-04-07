import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

interface BookingEmailData {
  customerName: string;
  customerEmail: string;
  workerName: string;
  category: string;
  scheduledAt: string;
  address: string;
  bookingId: string;
  amount: number;
}

export async function sendBookingConfirmation(data: BookingEmailData) {
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: data.customerEmail,
    subject: `Booking Confirmed — ${data.category} on ${data.scheduledAt}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#1a1a1a">Your booking is confirmed ✅</h2>
        <p>Hi ${data.customerName},</p>
        <p>Your <strong>${data.category}</strong> service has been booked.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0">
          <tr><td style="padding:8px;color:#666">Booking ID</td><td style="padding:8px;font-weight:600">${data.bookingId.slice(0,8).toUpperCase()}</td></tr>
          <tr style="background:#f9f9f9"><td style="padding:8px;color:#666">Worker</td><td style="padding:8px">${data.workerName}</td></tr>
          <tr><td style="padding:8px;color:#666">Scheduled</td><td style="padding:8px">${data.scheduledAt}</td></tr>
          <tr style="background:#f9f9f9"><td style="padding:8px;color:#666">Address</td><td style="padding:8px">${data.address}</td></tr>
          <tr><td style="padding:8px;color:#666">Amount Paid</td><td style="padding:8px;font-weight:600">₹${(data.amount / 100).toFixed(0)}</td></tr>
        </table>
        <p style="color:#666;font-size:14px">You'll get a live tracking link once the worker starts heading to you.</p>
      </div>
    `,
  });
}

export async function sendJobStartedNotification(data: {
  customerEmail: string;
  customerName: string;
  workerName: string;
  bookingId: string;
  trackingUrl: string;
}) {
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: data.customerEmail,
    subject: `${data.workerName} is on the way 🚶`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2>Your worker is heading to you!</h2>
        <p>Hi ${data.customerName}, <strong>${data.workerName}</strong> has started the job.</p>
        <a href="${data.trackingUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0">
          Track Live Location →
        </a>
      </div>
    `,
  });
}
