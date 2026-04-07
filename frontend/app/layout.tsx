import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import RoleBasedLayout from './_components/RoleBasedLayout';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

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
    <html lang="en" className={inter.variable}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#2563eb" />
      </head>
      <body className="bg-gray-50 text-gray-900 antialiased">
        <RoleBasedLayout>{children}</RoleBasedLayout>
      </body>
    </html>
  );
}
