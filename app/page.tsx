"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth";

export default function Home() {
  const { user, status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status !== "ready") return;
    if (!user) {
      router.replace("/login");
    } else {
      router.replace(user.role === "admin" ? "/admin" : "/dashboard");
    }
  }, [user, status, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background paper-grain">
      <div className="text-center space-y-3">
        <p className="font-display text-2xl font-semibold tracking-tight">Math Practice</p>
        <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-muted-foreground">
          loading…
        </p>
      </div>
    </div>
  );
}
