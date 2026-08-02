import { AlertTriangle, Database, EyeOff, Server, ShieldCheck, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { estimateStorageBytes, resetAllAppData } from '../utils/storage';

interface PrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PrivacyModal({ isOpen, onClose }: PrivacyModalProps) {
  const bytes = isOpen ? estimateStorageBytes() : 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Privacy & data"
      subtitle="What leaves your browser, and what does not"
      accent="emerald"
      icon={
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600">
          <ShieldCheck className="h-4 w-4 text-white" aria-hidden="true" />
        </div>
      }
    >
      <div className="space-y-4 text-xs leading-relaxed text-slate-300">
        <Card icon={Database} title="Everything is stored locally" tone="text-cyan-400">
          Collections, history, favourites and environment variables live in this browser&apos;s{' '}
          <code className="rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-cyan-300">
            localStorage
          </code>
          . There is no account, no server-side database and no sync.
          <p className="mt-2 font-mono text-[11px] text-slate-500">
            Currently using about {(bytes / 1024).toFixed(1)} KB.
          </p>
        </Card>

        <Card icon={Server} title="Where requests actually go" tone="text-indigo-400">
          By default your browser talks to the target API directly — nothing passes through us, and
          we cannot see the response. If you enable the proxy toggle, the request is relayed by
          whichever proxy is configured for the deployment you are using. The proxy forwards the
          request and returns the response; it does not store either.
        </Card>

        <Card
          icon={EyeOff}
          title="Credentials are redacted before any AI request"
          tone="text-amber-400"
        >
          The copilot receives your request so it can reason about it. Bearer tokens, API key
          values, basic-auth credentials, <code>Authorization</code> and <code>Cookie</code> headers
          and credential-shaped query parameters are replaced with{' '}
          <code className="text-amber-300">[redacted]</code> before the request leaves your machine,
          and the model is instructed never to invent replacements. Share links and collection
          exports exclude them too.
          <p className="mt-2 text-slate-400">
            The AI copilot is only active when the deployment has an API key configured. When it is
            not, the panel says so and falls back to a clearly-labelled offline pattern matcher — it
            never presents non-AI output as AI.
          </p>
        </Card>

        <Card icon={AlertTriangle} title="Things worth knowing" tone="text-rose-400">
          <ul className="list-inside list-disc space-y-1.5">
            <li>
              Anything you paste into a request body or prompt may be sent to the target API, and —
              apart from redacted credentials — to the model if AI is enabled. Use mock data for
              anything sensitive.
            </li>
            <li>
              AI output is probabilistic. Review generated requests before running them against
              production.
            </li>
            <li>
              A share link encodes the request shape in the URL. Anyone with the link sees the
              method, URL, parameters, headers and body — but never a credential.
            </li>
            <li>No analytics, no tracking cookies, no telemetry of any kind.</li>
          </ul>
        </Card>

        <div className="rounded-xl border border-rose-900/60 bg-rose-950/30 p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-rose-300">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Reset everything
          </h3>
          <p className="mb-3 text-slate-400">
            Removes all collections, history, favourites and environments from this browser.
          </p>
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  'Delete all Endpointer data stored in this browser? This cannot be undone.',
                )
              ) {
                resetAllAppData();
                window.location.reload();
              }
            }}
            className="rounded-lg border border-rose-700 bg-rose-900/60 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-900"
          >
            Delete local data
          </button>
        </div>

        <p className="text-[11px] text-slate-500">
          Questions: open an issue at{' '}
          <a
            href="https://github.com/TechLuddite/Endpointer/issues"
            target="_blank"
            rel="noreferrer noopener"
            className="text-cyan-400 underline"
          >
            github.com/TechLuddite/Endpointer
          </a>
          .
        </p>
      </div>
    </Modal>
  );
}

function Card({
  icon: Icon,
  title,
  tone,
  children,
}: {
  icon: typeof Database;
  title: string;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-xl border border-slate-800 bg-slate-950 p-4">
      <h3 className={`flex items-center gap-2 text-sm font-bold ${tone}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
        {title}
      </h3>
      <div className="text-slate-400">{children}</div>
    </section>
  );
}
