"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight, Briefcase, CheckCircle2, ClipboardList, Mail, MessageSquare, Plus, RefreshCw,
} from "lucide-react";
import { authFetch } from "../../../lib/api";
import {
  Badge, Callout, Card, CardBody, EmptyState, PageHeader, SectionHead, Stat,
  buttonClass, uiStyles as s,
} from "../../../lib/ui";

interface Project {
  id: string;
  name: string;
  status: string;
  sku_volume_estimate?: number;
  client_contact_name?: string;
  timeline_weeks?: number;
}
interface Lead {
  id: string;
  company_name: string;
  contact_person: string;
  pipeline_stage: string;
  email?: string;
}

const authHeaders = () => ({
  Authorization: "Bearer " + (typeof window !== "undefined" ? localStorage.getItem("rivu_access_token") || "" : ""),
});

const PROJECT_TONE = (status: string) =>
  /complete|delivered|done/.test(status) ? "ok" : /scope|progress|active/.test(status) ? "info" : "neutral";

const STAGE_LABEL: Record<string, string> = {
  lead_identified: "Received",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal_sent: "Proposal sent",
  won: "In delivery",
  lost: "Closed",
};

export default function ServicesPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsVisible, setLeadsVisible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  const [projectName, setProjectName] = useState("");
  const [projectContact, setProjectContact] = useState("");
  const [projectEmail, setProjectEmail] = useState("");
  const [skuVolume, setSkuVolume] = useState("");

  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [problem, setProblem] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [projectsRes, leadsRes] = await Promise.all([
        authFetch("/solutions/custom-solutions/projects", { headers: authHeaders() }),
        authFetch("/solutions/crm/leads", { headers: authHeaders() }),
      ]);
      const projectsData = await projectsRes.json().catch(() => ({}));
      setProjects(projectsData.projects || (Array.isArray(projectsData) ? projectsData : []));

      if (leadsRes.ok) {
        const leadsData = await leadsRes.json();
        setLeads(leadsData.leads || (Array.isArray(leadsData) ? leadsData : []));
        setLeadsVisible(true);
      } else {
        setLeads([]);
        setLeadsVisible(false);
      }
    } catch {
      setError("Could not load your service requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      await load();
    };
    run();
  }, [load]);

  async function createProject(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!projectName.trim()) {
      setError("Give the project a name so we know what to call it.");
      return;
    }
    setBusy("project");
    try {
      const res = await authFetch("/solutions/custom-solutions/projects", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName.trim(),
          client_contact_name: projectContact.trim() || null,
          client_contact_email: projectEmail.trim() || null,
          sku_volume_estimate: skuVolume ? Number(skuVolume) : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail?.message || data.detail || "Could not create the project.");
      setMessage("Request received. A specialist will confirm scope and timeline by email.");
      setProjectName("");
      setProjectContact("");
      setProjectEmail("");
      setSkuVolume("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the project.");
    } finally {
      setBusy("");
    }
  }

  async function createLead(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!company.trim() || !contact.trim() || !email.trim()) {
      setError("Add your company, a contact name and an email so we can reply.");
      return;
    }
    setBusy("lead");
    try {
      const res = await authFetch("/solutions/crm/leads", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: company.trim(),
          contact_person: contact.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          problem_description: problem.trim() || null,
          notes: problem.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail?.message || data.detail || "Could not submit the enquiry.");
      setMessage("Enquiry received. We reply to every enquiry within one working day.");
      setCompany("");
      setContact("");
      setEmail("");
      setPhone("");
      setProblem("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit the enquiry.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className={s.page}>
      <PageHeader
        eyebrow="Services"
        title="Services"
        sub="Need help connecting systems, cleaning a stubborn catalogue or building something custom? Ask here — or follow a project we are already delivering."
        actions={
          <button type="button" className={buttonClass("default")} onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      {error ? <Callout tone="bad">{error}</Callout> : null}
      {message ? (
        <Callout tone="ok" icon={CheckCircle2}>
          {message}
        </Callout>
      ) : null}

      <div className={s.grid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <Stat label="Your projects" value={projects.length} icon={ClipboardList} hint="Work we are doing with you" />
        <Stat
          label="In delivery"
          value={projects.filter((project) => !/complete|delivered/.test(project.status)).length}
          tone="ok"
          icon={Briefcase}
        />
        {leadsVisible ? <Stat label="Enquiries" value={leads.length} icon={MessageSquare} hint="Your recent requests" /> : null}
      </div>

      <div className={s.grid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <Card>
          <SectionHead
            icon={ClipboardList}
            title="Request a custom solution"
            sub="For larger projects: migrations, integrations, or a catalogue built to your marketplace."
          />
          <CardBody>
            <form onSubmit={createProject} className={s.stack} style={{ gap: 12 }}>
              <label className={s.field}>
                <span className={s.label}>What should we call it?</span>
                <input
                  className={s.input}
                  required
                  placeholder="e.g. Supplier catalogue migration"
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                />
              </label>
              <div className={s.grid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                <label className={s.field}>
                  <span className={s.label}>Your name</span>
                  <input
                    className={s.input}
                    placeholder="Optional"
                    value={projectContact}
                    onChange={(event) => setProjectContact(event.target.value)}
                  />
                </label>
                <label className={s.field}>
                  <span className={s.label}>Work email</span>
                  <input
                    className={s.input}
                    type="email"
                    placeholder="Optional"
                    value={projectEmail}
                    onChange={(event) => setProjectEmail(event.target.value)}
                  />
                </label>
              </div>
              <label className={s.field}>
                <span className={s.label}>Roughly how many products?</span>
                <input
                  className={s.input}
                  inputMode="numeric"
                  placeholder="e.g. 5000"
                  value={skuVolume}
                  onChange={(event) => setSkuVolume(event.target.value.replace(/[^0-9]/g, ""))}
                />
                <span className={s.hint}>A rough number is enough to size the work.</span>
              </label>
              <button type="submit" className={buttonClass("primary")} disabled={busy === "project"}>
                {busy === "project" ? "Sending..." : "Send request"} <ArrowRight size={14} />
              </button>
            </form>
            <div style={{ marginTop: 14 }}>
              <Callout tone="info" title="What happens next">
                We confirm the scope and timeline by email, then agree a start date. Nothing is charged until you approve the
                scope.
              </Callout>
            </div>
          </CardBody>
        </Card>

        <Card>
          <SectionHead
            icon={MessageSquare}
            title="Ask a question"
            sub="For anything smaller — a stuck import, an unclear report, or advice on what to fix first."
          />
          <CardBody>
            <form onSubmit={createLead} className={s.stack} style={{ gap: 12 }}>
              <label className={s.field}>
                <span className={s.label}>Company</span>
                <input
                  className={s.input}
                  required
                  placeholder="e.g. Apex Textiles"
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                />
              </label>
              <div className={s.grid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                <label className={s.field}>
                  <span className={s.label}>Contact name</span>
                  <input
                    className={s.input}
                    required
                    value={contact}
                    onChange={(event) => setContact(event.target.value)}
                  />
                </label>
                <label className={s.field}>
                  <span className={s.label}>Phone</span>
                  <input
                    className={s.input}
                    placeholder="Optional"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </label>
              </div>
              <label className={s.field}>
                <span className={s.label}>Email</span>
                <input
                  className={s.input}
                  type="email"
                  required
                  placeholder="you@company.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label className={s.field}>
                <span className={s.label}>What do you need help with?</span>
                <textarea
                  className={s.textarea}
                  placeholder="Describe the problem in your own words."
                  value={problem}
                  onChange={(event) => setProblem(event.target.value)}
                />
              </label>
              <button type="submit" className={buttonClass("primary")} disabled={busy === "lead"}>
                {busy === "lead" ? "Sending..." : "Send enquiry"} <ArrowRight size={14} />
              </button>
            </form>
            <div style={{ marginTop: 14 }}>
              <Callout tone="info" icon={Mail} title="What happens next">
                Every enquiry gets a reply within one working day, usually with a short list of questions or a suggested fix.
              </Callout>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card flush>
        <SectionHead icon={Briefcase} title="Your projects" sub="Everything we are working on for you." />
        {loading ? (
          <CardBody>
            <div className={s.stack}>
              {[0, 1].map((row) => (
                <div key={row} className={s.skeleton} style={{ height: 48 }} />
              ))}
            </div>
          </CardBody>
        ) : projects.length === 0 ? (
          <CardBody>
            <EmptyState icon={ClipboardList} title="No projects yet">
              Use the form above when you need help with something larger than a single file.
            </EmptyState>
          </CardBody>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Products (estimate)</th>
                  <th>Contact</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td className={s.strong}>{project.name}</td>
                    <td>
                      <Badge tone={PROJECT_TONE(project.status)} dot>
                        {project.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="num">{project.sku_volume_estimate ? project.sku_volume_estimate.toLocaleString() : "—"}</td>
                    <td>{project.client_contact_name || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {leadsVisible ? (
        <Card flush>
          <SectionHead icon={MessageSquare} title="Your enquiries" sub="Every question you have sent, newest last." />
          {loading ? (
            <CardBody>
              <div className={s.skeleton} style={{ height: 60 }} />
            </CardBody>
          ) : leads.length === 0 ? (
            <CardBody>
              <EmptyState icon={MessageSquare} title="No enquiries yet">
                Ask a question above and it will appear here with its current stage.
              </EmptyState>
            </CardBody>
          ) : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Contact</th>
                    <th>Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id}>
                      <td className={s.strong}>{lead.company_name}</td>
                      <td>{lead.contact_person}</td>
                      <td>
                        <Badge tone="info">{STAGE_LABEL[lead.pipeline_stage] || lead.pipeline_stage.replace(/_/g, " ")}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Callout tone="neutral" icon={Plus} title="Enquiry history is not available">
          Your account can submit enquiries, but only a workspace owner can see the full enquiry list. The requests themselves
          are saved.
        </Callout>
      )}
    </div>
  );
}