"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth";

import { AuthChrome } from "@/app/login/page";

export default function RegisterPage() {
  const { register, user, status } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "ready" && user) {
      router.replace(user.role === "admin" ? "/admin" : "/dashboard");
    }
  }, [user, status, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await register(email.trim(), name.trim(), password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthChrome
      eyebrow="New student"
      title="Open a fresh notebook."
      subtitle="A free account; your work is saved between sessions and visible to your teacher."
      footer={
        <p className="text-sm text-muted-foreground">
          Already enrolled?{" "}
          <Link href="/login" className="text-mark underline-offset-4 hover:underline">
            Sign in
          </Link>
          .
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jordan Park"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@school.edu"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">At least 6 characters.</p>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Couldn&rsquo;t register</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={submitting} className="w-full" size="lg">
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthChrome>
  );
}
