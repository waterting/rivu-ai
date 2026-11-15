"use client";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, Loader2, Mail } from "lucide-react";
import AuthShell from "../../lib/AuthShell";
import styles from "../../lib/auth.module.css";
import { API, extractErrorMessage } from "../../lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setToken(new URLSearchParams(window.location.search).get("token") || "");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    if (!token && !EMAIL_RE.test(email.trim())) {
      setError("Enter a valid work email address.");
      setBusy(false);
      return;
    }
    if (token && password.length < 8) {
      setError("Password must be at least 8 characters.");
      setBusy(false);
      return;
    }

    try {
      const path = token ? "/auth/password-reset/complete" : "/auth/password-reset/request";
      const body = token ? { token, new_password: password } : { email: email.trim() };
      const response = await fetch(API + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(extractErrorMessage(data, "Request failed"));
      setMessage(data.message || "Request completed.");
      if (token) setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      kicker={token ? "Rivu / Account recovery" : "Rivu / Account recovery"}
      heading={
        token ? (
          <>
            Choose a new <em>password.</em>
          </>
        ) : (
          <>
            Recover your <em>account.</em>
          </>
        )
      }
      sub={
        token
          ? "Use a strong password with uppercase, lowercase and a number. Your existing sessions will be signed out."
          : "We will email a secure, time-limited reset link if an account exists for that address."
      }
      switchPrompt={
        <>
          Remembered it? <Link href="/login">Sign in</Link>
        </>
      }
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        {error && (
          <div className={styles.error} role="alert">
            <span>{error}</span>
          </div>
        )}
        {message && (
          <div className={styles.success} role="status">
            <Mail size={15} />
            <span>{message}</span>
          </div>
        )}

        {token ? (
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="reset-password">
              New password
            </label>
            <span className={styles.inputWrap}>
              <input
                id="reset-password"
                className={styles.input}
                type={reveal ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                maxLength={128}
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
          </div>
        ) : (
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="reset-email">
              Work email
            </label>
            <input
              id="reset-email"
              className={styles.input}
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              required
            />
          </div>
        )}

        <button className={styles.submit} type="submit" disabled={busy}>
          {busy ? (
            <>
              <Loader2 size={16} className={styles.spinner} /> Please wait...
            </>
          ) : (
            <>
              {token ? "Update password" : "Send reset link"} <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>

      <p className={styles.legal} style={{ marginTop: 18 }}>
        Reset links expire for your security. Request a new one if it has lapsed.
      </p>
    </AuthShell>
  );
}