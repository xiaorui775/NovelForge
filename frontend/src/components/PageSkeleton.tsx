export default function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-3 w-24 bg-study-border/40 rounded" />
          <div className="h-7 w-48 bg-study-border/40 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-20 bg-study-border/40 rounded-lg" />
          <div className="h-9 w-20 bg-study-border/40 rounded-lg" />
        </div>
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card-compact space-y-2">
            <div className="h-2.5 w-12 bg-study-border/40 rounded" />
            <div className="h-7 w-16 bg-study-border/40 rounded" />
          </div>
        ))}
      </div>

      {/* Content skeleton */}
      <div className="card space-y-4">
        <div className="h-4 w-32 bg-study-border/40 rounded" />
        <div className="space-y-2.5">
          <div className="h-3 w-full bg-study-border/30 rounded" />
          <div className="h-3 w-5/6 bg-study-border/30 rounded" />
          <div className="h-3 w-4/6 bg-study-border/30 rounded" />
        </div>
      </div>

      {/* Grid skeleton */}
      <div className="grid grid-cols-2 gap-3">
        {[1, 2].map((i) => (
          <div key={i} className="card-compact">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-study-border/30" />
              <div className="space-y-1.5 flex-1">
                <div className="h-3.5 w-24 bg-study-border/40 rounded" />
                <div className="h-2.5 w-32 bg-study-border/30 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
