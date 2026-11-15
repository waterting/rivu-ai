"use client";
import { FormEvent, useState } from "react";
import { ArrowRight, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthShell from "../../lib/AuthShell";
import GoogleSignInButton from "../../lib/GoogleSignInButton";
import styles from "../../lib/auth.module.css";
import { API, extractErrorMessage } from "../../lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,50}$/;

export default function Signup() {
  const router = useRouter();
  const [full_name, setFull] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const invalid = {
    full_name: touched.full_name && full_name.trim().length < 2,
    username: touched.username && !USERNAME_RE.test(username),
    email: touched.email && !EMAIL_RE.test(email.trim()),
    password: touched.password && password.length < 8,
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setTouched({ full_name: true, username: true, email: true, password: true });

    if (full_name.trim().length < 2) {
      setError("Enter your full name.");
      return;
    }
    if (!USERNAME_RE.test(username)) {
      setError("Username must be 3-50 characters using letters, numbers, dot, dash or underscore.");
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError("Enter a valid work email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setBusy(true);
    try {
      const r = await fetch(API + "/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: full_name.trim(),
          username: username.trim(),
          email: email.trim(),
          password,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(extractErrorMessage(d, "Signup failed"));

      if (d.verification_required) {
        router.push("/verify-email?sent=1");
        return;
      }

      localStorage.setItem("rivu_access_token", d.tokens.access_token);
      localStorage.setItem("rivu_refresh_token", d.tokens.refresh_token);
      localStorage.setItem("rivu_user", JSON.stringify(d.user));
      localStorage.setItem("rivu_org", JSON.stringify(d.organization));

      const tool = new URLSearchParams(window.location.search).get("tool");
      router.push(tool ? `/dashboard/tools?tool=${tool}` : "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
      setBusy(false);
    }
  }

  return (
    <AuthShell
      kicker="Start your refinery"
      heading={
        <>
          Create your <em>workspace.</em>
        </>
      }
      sub="Bring operational data into a controlled, intelligence-ready environment. Every workspace is isolated, permissioned and auditable."
      switchPrompt={
        <>
          Already have an account? <Link href="/login">Sign in</Link>
        </>
      }
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        {error && (
          <div className={styles.error} role="alert">
            <span>{error}</span>
          </div>
        )}

        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="signup-name">
              Full name
            </label>
            <input
              id="signup-name"
              className={styles.input}
              value={full_name}
              onChange={(e) => setFull(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, full_name: true }))}
              aria-invalid={invalid.full_name || undefined}
              placeholder="Your name"
              autoComplete="name"
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="signup-username">
              Username
            </label>
            <input
              id="signup-username"
              className={styles.input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, username: true }))}
              aria-invalid={invalid.username || undefined}
              placeholder="company-admin"
              autoComplete="nickname"
              required
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="signup-email">
            Work email
          </label>
          <input
            id="signup-email"
            className={styles.input}
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            aria-invalid={invalid.email || undefined}
            placeholder="you@company.com"
            autoComplete="email"
            required
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="signup-password">
            Password
          </label>
          <span className={styles.inputWrap}>
            <input
              id="signup-password"
              className={styles.input}
              type={reveal ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              aria-invalid={invalid.password || undefined}
              aria-describedby="signup-password-hint"
              minLength={8}
              placeholder="At least 8 characters"
              autoComplete="new-password"
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
          <span id="signup-password-hint" className={styles.hint}>
            Minimum 8 characters. Use a mix of letters, numbers and symbols.
          </span>
        </div>

        <button className={styles.submit} type="submit" disabled={busy}>
          {busy ? (
            <>
              <Loader2 size={16} className={styles.spinner} /> Creating workspace...
            </>
          ) : (
            <>
              Create workspace <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>

      <div className={styles.divider}>or continue with</div>
      <GoogleSignInButton busy={busy} setBusy={setBusy} setError={setError} text="signup_with" />

      <p className={styles.legal} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <ShieldCheck size={13} /> Your workspace is isolated from other organizations.
      </p>
    </AuthShell>
  );
}