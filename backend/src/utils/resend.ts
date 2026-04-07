import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);
export async function sendBookingConfirmation(data: { customerName: string; customerEmail: string; workerName: string; category: string; scheduledAt: string; address: string; bookingId: string; amount: number; }) {
  await resend.emails.send({ from: process.env.RESEND_FROM_EMAIL!, to: data.customerEmail, subject: `Booking Confirmed — ${data.category}`, html: `<div style="font-family:sans-serif"><h2>Booking Confirmed ✅</h2><p>Hi ${data.customerName}, your <b>${data.category}</b> booking is confirmed.</p><p>Worker: ${data.workerName}</p><p>When: ${data.scheduledAt}</p><p>Address: ${data.address}</p><p>Amount: ₹${(data.amount/100).toFixed(0)}</p></div>` });
}
export async function sendJobStartedNotification(data: { customerEmail: string; customerName: string; workerName: string; bookingId: string; trackingUrl: string; }) {
  await resend.emails.send({ from: process.env.RESEND_FROM_EMAIL!, to: data.customerEmail, subject: `${data.workerName} is on the way 🚶`, html: `<div style="font-family:sans-serif"><h2>Worker heading to you!</h2><p>Hi ${data.customerName}, ${data.workerName} has started.</p><a href="${data.trackingUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin:16px 0">Track Live →</a></div>` });
}
