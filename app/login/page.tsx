"use client";
import { FormEvent, useState } from "react";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthShell from "../../lib/AuthShell";
import GoogleSignInButton from "../../lib/GoogleSignInButton";
import ProcessingRail from "../../lib/ProcessingRail";
import styles from "../../lib/auth.module.css";
import { API, extractErrorMessage } from "../../lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({});

  const emailInvalid = touched.email && !EMAIL_RE.test(email.trim());
  const passwordInvalid = touched.password && password.length === 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setTouched({ email: true, password: true });

    if (!EMAIL_RE.test(email.trim())) {
      setError("Enter a valid work email address.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }

    setBusy(true);
    try {
      const r = await fetch(API + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(extractErrorMessage(d, "Login failed"));

      localStorage.setItem("rivu_access_token", d.tokens.access_token);
      localStorage.setItem("rivu_refresh_token", d.tokens.refresh_token);
      localStorage.setItem("rivu_user", JSON.stringify(d.user));
      localStorage.setItem("rivu_org", JSON.stringify(d.organization));

      const tool = new URLSearchParams(window.location.search).get("tool");
      router.push(tool ? `/dashboard/tools?tool=${tool}` : "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
      setBusy(false);
    }
  }

  return (
    <AuthShell
      kicker="Rivu / Secure entry"
      heading={
        <>
          Enter the <em>refinery.</em>
        </>
      }
      sub="Sign in to your isolated workspace to profile, refine and analyse operational data with measured, explainable intelligence."
      switchPrompt={
        <>
          New to Rivu? <Link href="/signup">Create a workspace</Link>
        </>
      }
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        {error && (
          <div className={styles.error} role="alert">
            <Lock size={15} />
            <span>{error}</span>
          </div>
        )}

        <ProcessingRail active={busy} label="Authenticating workspace" />

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="login-email">
            Work email
          </label>
          <input
            id="login-email"
            className={styles.input}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            aria-invalid={emailInvalid || undefined}
            aria-describedby={emailInvalid ? "login-email-error" : undefined}
            placeholder="you@company.com"
            required
          />
          {emailInvalid && (
            <span id="login-email-error" className={styles.hint} style={{ color: "#ffb3bd" }}>
              Enter a valid email address.
            </span>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="login-password">
            Password
          </label>
          <span className={styles.inputWrap}>
            <input
              id="login-password"
              className={styles.input}
              type={reveal ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              aria-invalid={passwordInvalid || undefined}
              placeholder="Your password"
              required
            />
            <button
              type="button"
              className={styles.reveal}
              onClick={() => setReveal((v) => !v)}
              aria-label={reveal ? "Hide password" : "Show password"}
            >
              {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </span>
        </div>

        <div className={styles.linkRow}>
          <Link href="/reset-password">Forgot password?</Link>
        </div>

        <button className={styles.submit} type="submit" disabled={busy}>
          {busy ? (
            <>
              <Loader2 size={16} className={styles.spinner} /> Signing in...
            </>
          ) : (
            <>
              Sign in <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>

      <div className={styles.divider}>or continue with</div>
      <GoogleSignInButton busy={busy} setBusy={setBusy} setError={setError} text="signin_with" />

      <p className={styles.legal} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <ShieldCheck size={13} /> Tenant-isolated workspace · <Sparkles size={13} /> Groq-powered intelligence
      </p>
    </AuthShell>
  );
}