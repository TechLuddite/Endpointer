import { Building2, Coffee, DollarSign, ExternalLink, Github, Heart, Star } from 'lucide-react';
import { Modal } from './Modal';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const LINKS = [
  {
    href: 'https://buymeacoffee.com/techluddite',
    icon: Coffee,
    title: 'Buy me a coffee',
    detail: 'A one-off tip',
    accent: 'border-amber-500/40 hover:border-amber-400 text-amber-200',
    iconClass: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  },
  {
    href: 'https://www.paypal.com/donate/?hosted_button_id=JLAGXTV4FX96S',
    icon: DollarSign,
    title: 'PayPal',
    detail: 'Direct contribution',
    accent: 'border-cyan-500/40 hover:border-cyan-400 text-cyan-200',
    iconClass: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  },
  {
    href: 'https://github.com/TechLuddite/Endpointer',
    icon: Star,
    title: 'Star the repo',
    detail: 'Free, and genuinely helps',
    accent: 'border-purple-500/30 hover:border-purple-400/60 text-purple-200',
    iconClass: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  },
  {
    href: 'https://github.com/TechLuddite',
    icon: Github,
    title: 'GitHub @TechLuddite',
    detail: 'Other projects',
    accent: 'border-slate-700/60 hover:border-slate-500 text-slate-200',
    iconClass: 'bg-slate-800 text-slate-300 border-slate-700',
  },
];

export function SupportModal({ isOpen, onClose }: SupportModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Support development"
      subtitle="Endpointer is free and MIT-licensed"
      accent="purple"
      maxWidth="max-w-lg"
      icon={
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-pink-500 to-rose-600">
          <Heart className="h-4 w-4 fill-current text-white" aria-hidden="true" />
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        <p className="rounded-xl border border-slate-800 bg-slate-950 p-4 leading-relaxed text-slate-400">
          Endpointer is open source and has no paid tier, no account and no telemetry. If it saves
          you time, any of these help — starring the repository most of all.
        </p>

        <ul className="space-y-2.5">
          {LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <li key={link.href}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={`group flex items-center justify-between rounded-xl border bg-gradient-to-r from-slate-900 to-slate-950 p-3.5 transition-all ${link.accent}`}
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-lg border ${link.iconClass}`}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block text-xs font-bold">{link.title}</span>
                      <span className="block text-[11px] text-slate-400">{link.detail}</span>
                    </span>
                  </span>
                  <ExternalLink className="h-4 w-4 opacity-70" aria-hidden="true" />
                </a>
              </li>
            );
          })}
        </ul>

        <section className="space-y-2.5 rounded-xl border border-slate-800 bg-slate-950/90 p-4 font-sans">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-cyan-400">
            <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            Thanks
          </h3>
          <p className="text-xs leading-relaxed text-slate-300">
            To{' '}
            <a
              href="https://halomsp.com"
              target="_blank"
              rel="noreferrer noopener"
              className="font-semibold text-cyan-400 underline hover:text-cyan-300"
            >
              Halo MSP
            </a>{' '}
            for helping businesses navigate safe and sensible AI and software implementations, and
            to their parent company{' '}
            <a
              href="https://tech2u.com"
              target="_blank"
              rel="noreferrer noopener"
              className="font-semibold text-cyan-400 underline hover:text-cyan-300"
            >
              Tech 2U
            </a>
            .
          </p>
        </section>
      </div>
    </Modal>
  );
}
