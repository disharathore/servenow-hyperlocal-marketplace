export function FullPageSkeleton() {
  return (
    <div className="min-h-screen p-4">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="skeleton h-14 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card p-4 space-y-3">
            <div className="skeleton h-4 w-24" />
            <div className="skeleton h-8 w-20" />
          </div>
          <div className="card p-4 space-y-3">
            <div className="skeleton h-4 w-28" />
            <div className="skeleton h-8 w-24" />
          </div>
          <div className="card p-4 space-y-3">
            <div className="skeleton h-4 w-20" />
            <div className="skeleton h-8 w-16" />
          </div>
        </div>
        <div className="card p-4 space-y-3">
          <div className="skeleton h-5 w-48" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-5/6" />
          <div className="skeleton h-4 w-4/6" />
        </div>
      </div>
    </div>
  );
}

export function CardListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="card p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="skeleton h-4 w-40" />
            <div className="skeleton h-6 w-20" />
          </div>
          <div className="skeleton h-3 w-56" />
          <div className="skeleton h-3 w-36" />
        </div>
      ))}
    </div>
  );
}
