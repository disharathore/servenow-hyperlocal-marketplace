# ServeNow Demo Checklist

Use this quick list before sharing with a recruiter/interviewer.

## 1. Startup

- Run `npm install` at project root once.
- Run `npm run dev` at project root.
- Confirm frontend is reachable and backend health returns OK.

## 2. Customer flow

- Login with OTP.
- Browse a category and open a worker profile.
- Book and pay successfully.
- Open tracking page and verify status updates.
- Raise a dispute from tracking page and verify disputed status.

## 3. Worker flow

- Login as worker.
- Complete worker setup with selected category.
- See incoming booking request.
- Accept and start job.
- Confirm customer tracking updates in real-time.

## 4. Admin flow

- Login as admin.
- Open stats overview.
- Open disputes tab and resolve disputed booking.
- Confirm dispute disappears from open disputes list.

## 5. Reliability checks

- Refresh notifications page and verify history persists.
- Logout/login and confirm socket events still work.
- Open profile and save with valid pincode.
- Trigger an error route and confirm global error fallback appears.

## 6. Final proof artifacts

- Screenshot customer booking + tracking.
- Screenshot worker dashboard active job.
- Screenshot admin disputes resolution.
- Keep deployed URLs ready.
