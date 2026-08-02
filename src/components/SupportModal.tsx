import React from 'react';
import {
  X,
  Heart,
  Github,
  ExternalLink,
  Star,
  Coffee,
  DollarSign,
  Sparkles,
  ShieldCheck,
  Building2,
} from 'lucide-react';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl shadow-indigo-950/50 flex flex-col font-mono text-slate-200">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-950 via-slate-900 to-purple-950 border-b border-indigo-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-pink-500 to-rose-600 flex items-center justify-center shadow-lg shadow-pink-500/30">
              <Heart className="w-5 h-5 text-white fill-current" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white tracking-wide">Developer Support</h3>
              <p className="text-xs text-indigo-300">Support Open Source Development</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 text-xs text-slate-300 leading-relaxed overflow-y-auto max-h-[80vh]">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <p className="text-slate-200 font-semibold text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Support Endpointer & TechLuddite Projects
            </p>
            <p className="text-slate-400 text-xs leading-relaxed">
              Endpointer is free and open-source software built for developers. If this tool saves
              you time or helps your workflow, consider supporting development or starring the
              repository!
            </p>
          </div>

          {/* Support Actions */}
          <div className="space-y-2.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
              Direct Support & Sponsorship
            </span>

            {/* Buy Me a Coffee */}
            <a
              href="https://buymeacoffee.com/techluddite"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-amber-500/15 via-slate-900 to-slate-950 border border-amber-500/40 hover:border-amber-400 transition-all group shadow-md shadow-amber-950/20"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 group-hover:scale-105 transition-transform">
                  <Coffee className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-amber-200 text-xs group-hover:text-amber-300 flex items-center gap-2">
                    <span>Buy Me a Coffee</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                      Ko-fi / Coffee
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Support techluddite with a quick tip or coffee
                  </div>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-amber-400/70 group-hover:text-amber-300 transition-colors" />
            </a>

            {/* PayPal Donate */}
            <a
              href="https://www.paypal.com/donate/?hosted_button_id=JLAGXTV4FX96S"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-cyan-500/15 via-slate-900 to-slate-950 border border-cyan-500/40 hover:border-cyan-400 transition-all group shadow-md shadow-cyan-950/20"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30 group-hover:scale-105 transition-transform">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-cyan-200 text-xs group-hover:text-cyan-300 flex items-center gap-2">
                    <span>PayPal Donation</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold">
                      PayPal
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Direct contribution via PayPal Donate
                  </div>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-cyan-400/70 group-hover:text-cyan-300 transition-colors" />
            </a>

            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 pt-2 block">
              GitHub & Open Source
            </span>

            {/* GitHub Repo Star */}
            <a
              href="https://github.com/TechLuddite/Endpointer"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-purple-500/10 via-slate-900 to-slate-950 border border-purple-500/30 hover:border-purple-400/60 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
                  <Star className="w-4 h-4 fill-current" />
                </div>
                <div>
                  <div className="font-bold text-purple-200 text-xs group-hover:text-purple-300">
                    Star on GitHub
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Star TechLuddite/Endpointer on GitHub
                  </div>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-purple-400/70 group-hover:text-purple-300 transition-colors" />
            </a>

            {/* GitHub Profile */}
            <a
              href="https://github.com/TechLuddite"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-slate-800/40 via-slate-900 to-slate-950 border border-slate-700/60 hover:border-slate-500 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center border border-slate-700">
                  <Github className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-slate-200 text-xs group-hover:text-white">
                    GitHub @TechLuddite
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Explore open source repositories & projects
                  </div>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-slate-200 transition-colors" />
            </a>
          </div>

          {/* Special Thanks & Tech Shout-Out Section */}
          <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2.5 font-sans">
            <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs tracking-wide">
              <Building2 className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="uppercase">SPECIAL THANKS & TECH SHOUT-OUT</span>
            </div>

            <p className="text-slate-300 text-xs leading-relaxed">
              Huge shout-out to{' '}
              <a
                href="https://halomsp.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 underline font-semibold inline-flex items-center gap-0.5"
              >
                <span>Halo MSP</span>
                <ExternalLink className="w-3 h-3" />
              </a>{' '}
              <span className="text-slate-400 font-mono">(halomsp.com)</span>—helping businesses
              navigate safe and sensible AI and software implementations!
            </p>

            <p className="text-slate-300 text-xs leading-relaxed">
              And to their parent company,{' '}
              <a
                href="https://tech2u.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 underline font-semibold inline-flex items-center gap-0.5"
              >
                <span>Tech 2U</span>
                <ExternalLink className="w-3 h-3" />
              </a>{' '}
              <span className="text-slate-400 font-mono">(tech2u.com)</span>, ready to assist with
              any business or personal IT need with expert, reliable support.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5 text-emerald-400 text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>100% Free & Open Source</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
