'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full card p-6 text-center">
        <p className="text-lg font-semibold text-gray-900">Something went wrong</p>
        <p className="text-sm text-gray-500 mt-2">
          We hit an unexpected error. Please try again.
        </p>
        <button className="btn-primary mt-4" onClick={() => reset()}>
          Retry
        </button>
      </div>
    </div>
  );
}
