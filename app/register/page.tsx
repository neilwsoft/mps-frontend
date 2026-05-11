"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth";

import { AuthChrome } from "@/app/login/page";

export default function RegisterPage() {
  const { register, user, status } = useAuth();
  const router = useRouter();
  const t = useTranslations("auth.register");
  const tFields = useTranslations("auth.fields");
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
      setError(err instanceof Error ? err.message : t("errorFallback"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthChrome
      eyebrow={t("eyebrow")}
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <p className="text-sm text-muted-foreground">
          {t("footerPrompt")}{" "}
          <Link href="/login" className="text-mark underline-offset-4 hover:underline">
            {t("footerLink")}
          </Link>
          .
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">{t("fullName")}</Label>
          <Input
            id="name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{tFields("email")}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={tFields("emailPlaceholder")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{tFields("password")}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("passwordHint")}</p>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>{t("errorTitle")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={submitting} className="w-full" size="lg">
          {submitting ? t("submitting") : t("submit")}
        </Button>
      </form>
    </AuthChrome>
  );
}
