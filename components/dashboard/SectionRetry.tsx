"use client";

import { useRouter } from "next/navigation";

export function SectionRetry() {
  const router = useRouter();

  return (
    <button
      type="button"
      className="mt-4 rounded border border-current px-3 py-2 text-xs font-medium hover:bg-[rgba(238,143,129,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      onClick={() => router.refresh()}
    >
      Refresh dashboard data
    </button>
  );
}
