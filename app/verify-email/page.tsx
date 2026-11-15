"use client";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Mail } from "lucide-react";
import AuthShell from "../../lib/AuthShell";
import styles from "../../lib/auth.module.css";
import { API, extractErrorMessage } from "../../lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function VerifyEmailPage() {
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("Checking verification link...");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token") || "";
    const frame = window.requestAnimationFrame(() => {
      setToken(value);
      if (!value) setMessage("Verify your email to activate your Rivu account.");
    });
    if (value) {
      fetch(API + "/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: value }),
      })
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(extractErrorMessage(data, "Verification failed"));
          setMessage(data.message || "Email verified successfully.");
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Verification failed");
          setMessage("");
        });
    }
    return () => window.cancelAnimationFrame(frame);
  }, []);

  async function resend(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    if (!EMAIL_RE.test(email.trim())) {
      setError("Enter a valid work email address.");
      setBusy(false);
      return;
    }

    try {
      const response = await fetch(API + "/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(extractErrorMessage(data, "Could not send email"));
      setMessage(data.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send email");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      kicker="Rivu / Email security"
      heading={
        <>
          Verify your <em>identity.</em>
        </>
      }
      sub="A verified email keeps your workspace recoverable and your data isolated. Confirm the link we sent, or request a fresh one below."
      switchPrompt={
        <>
          Already verified? <Link href="/login">Sign in</Link>
        </>
      }
    >
      <form className={styles.form} onSubmit={resend} noValidate>
        {error && (
          <div className={styles.error} role="alert">
            <span>{error}</span>
          </div>
        )}
        {message && !error && (
          <div className={styles.success} role="status">
            <Mail size={15} />
            <span>{message}</span>
          </div>
        )}

        {!token && (
          <>
            <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="verify-email">
              Work email
            </label>
            <input
              id="verify-email"
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

            <button className={styles.submit} type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 size={16} className={styles.spinner} /> Sending...
                </>
              ) : (
                <>
                  Resend verification email <ArrowRight size={16} />
                </>
              )}
            </button>
          </>
        )}
      </form>

      {token && (
        <p className={styles.legal} style={{ marginTop: 18 }}>
          You can close this tab once verification completes.
        </p>
      )}
    </AuthShell>
  );
}