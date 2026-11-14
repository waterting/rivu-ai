"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight, Mail, ShieldCheck, Clock, CheckCircle2,
} from "lucide-react";
import styles from "../marketing.module.css";
import { PageHero, SectionHead } from "../ui";

const CONTACT_EMAIL = "hello@rivu.ai";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [topic, setTopic] = useState("Book a demo");
  const [message, setMessage] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const subject = encodeURIComponent(`Rivu enquiry — ${topic} — ${company || name}`);
    const body = encodeURIComponent(
      `Name: ${name}\nEmail: ${email}\nCompany: ${company}\nTopic: ${topic}\n\n${message}`,
    );
    // Opens the user's email client — a real, working action.
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  }

  return (
    <>
      <PageHero
        eyebrow="Contact"
        title={<>Tell us about <em>your data.</em></>}
        lead="Book a demo, scope an implementation or ask a question. We assess data shape, target schema and workflow before proposing anything."
      />

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.contactGrid}>
            <div>
              <SectionHead eyebrow="Send a message" title="Start the conversation." />
              <form onSubmit={submit} className={styles.card}>
                <div className={styles.formField}>
                  <label htmlFor="c-name">Name</label>
                  <input id="c-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Your name" />
                </div>
                <div className={styles.formField}>
                  <label htmlFor="c-email">Work email</label>
                  <input id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com" />
                </div>
                <div className={styles.formField}>
                  <label htmlFor="c-company">Company</label>
                  <input id="c-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company name" />
                </div>
                <div className={styles.formField}>
                  <label htmlFor="c-topic">Topic</label>
                  <select id="c-topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
                    <option>Book a demo</option>
                    <option>Custom implementation</option>
                    <option>Pricing & plans</option>
                    <option>Integrations</option>
                    <option>Security & governance</option>
                  </select>
                </div>
                <div className={styles.formField}>
                  <label htmlFor="c-message">How can we help?</label>
                  <textarea id="c-message" value={message} onChange={(e) => setMessage(e.target.value)} required placeholder="Tell us about your data and what you need to produce." />
                </div>
                <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} style={{ width: "100%" }}>
                  <Mail /> Send message
                </button>
                <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 14, textAlign: "center" }}>
                  This opens your email client addressed to {CONTACT_EMAIL}. No data is sent to a server by this form.
                </p>
              </form>
            </div>

            <aside className={styles.contactAside}>
              <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, margin: "0 0 20px" }}>
                Prefer email?
              </h3>
              <a href={`mailto:${CONTACT_EMAIL}`} className={styles.btn} style={{ marginBottom: 24 }}>
                <Mail /> {CONTACT_EMAIL}
              </a>
              <ul className={styles.specList}>
                <li><Clock />We respond within one business day.</li>
                <li><ShieldCheck />Your data stays inside your workspace.</li>
                <li><CheckCircle2 />We scope before we propose.</li>
              </ul>
            </aside>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.container}>
          <SectionHead
            eyebrow="What happens next"
            title="A defined path, not an open-ended promise."
            center
          />
          <div className={styles.steps}>
            {[
              { t: "We review your context", d: "Source files, systems you export from and the output you need." },
              { t: "We scope the workflow", d: "Data shape, target schema and validation rules — defined before anything is proposed." },
              { t: "You decide", d: "Start with Rivu, book a deeper demo or commission a scoped implementation." },
            ].map((s) => (
              <div key={s.t} className={styles.step}>
                <span className={styles.stepNum} />
                <div><h3>{s.t}</h3><p>{s.d}</p></div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 30 }}>
            <Link href="/signup" className={`${styles.btn} ${styles.btnViolet}`}>Start with Rivu <ArrowRight /></Link>
          </div>
        </div>
      </section>
    </>
  );
}