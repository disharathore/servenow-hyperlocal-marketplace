import type { Metadata, Viewport } from 'next';
import { Poppins, Space_Grotesk } from 'next/font/google';
import './globals.css';
import RoleBasedLayout from './_components/RoleBasedLayout';
import GlobalToaster from './_components/GlobalToaster';

const sans = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans' });
const heading = Space_Grotesk({ subsets: ['latin'], variable: '--font-heading' });

export const metadata: Metadata = {
  title: 'ServeNow — Local Services On Demand',
  description: 'Book verified local services instantly. Plumbers, electricians, tutors, and more.',
  icons: { icon: '/favicon.ico' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#2563eb',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${heading.variable}`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#2563eb" />
      </head>
      <body className="text-gray-900 antialiased">
        <RoleBasedLayout>{children}</RoleBasedLayout>
        <GlobalToaster />
      </body>
    </html>
  );
}
