'use client';
import RoleHeader from '@/app/_components/RoleHeader';

interface AppWrapperLayoutProps {
  children: React.ReactNode;
}

export default function AppWrapperLayout({ children }: AppWrapperLayoutProps) {
  return (
    <>
      <RoleHeader />
      <main className="bg-gray-50 min-h-[calc(100vh-60px)]">
        {children}
      </main>
    </>
  );
}
