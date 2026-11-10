"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/shell");
  }, [router]);
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black text-white">
      <div className="text-center">
        <div className="text-6xl font-light text-emerald-400">V</div>
        <div className="mt-4 text-sm text-neutral-400">Cargando…</div>
      </div>
    </div>
  );
}
