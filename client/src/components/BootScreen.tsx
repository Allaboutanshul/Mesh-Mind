import { useState, useEffect } from 'react';
import { Shield, Radio, Route, MessageSquare, Lock, Cpu } from 'lucide-react';

const BOOT_STEPS = [
  { icon: Cpu, label: 'Network engine', delay: 400 },
  { icon: Route, label: 'Routing engine', delay: 600 },
  { icon: MessageSquare, label: 'Message queue', delay: 300 },
  { icon: Lock, label: 'Security layer', delay: 500 },
  { icon: Radio, label: 'Simulation engine', delay: 400 },
];

export default function BootScreen({ onComplete, initDone }: { onComplete: () => void; initDone: boolean }) {
  const [currentStep, setCurrentStep] = useState(-1);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const runStep = (idx: number) => {
      if (idx >= BOOT_STEPS.length) {
        setTimeout(() => setDone(true), 600);
        setTimeout(onComplete, 1400);
        return;
      }
      setCurrentStep(idx);
      timeout = setTimeout(() => runStep(idx + 1), BOOT_STEPS[idx].delay);
    };
    setTimeout(() => runStep(0), 500);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="fixed inset-0 bg-[#0a0e1a] flex items-center justify-center z-50">
      <div className="text-center">
        <div className="flex items-center justify-center gap-3 mb-8">
          <Shield className="w-10 h-10 text-[#00d4aa]" />
          <h1 className="text-4xl font-bold tracking-wider text-white font-mono">MESHMIND</h1>
        </div>
        <p className="text-[#94a3b8] text-sm mb-8 font-mono tracking-widest">
          INITIALIZING EMERGENCY NETWORK...
        </p>
        <div className="space-y-3 text-left max-w-xs mx-auto">
          {BOOT_STEPS.map((step, i) => {
            const Icon = step.icon;
            const isComplete = i < currentStep || (i === currentStep && done);
            const isCurrent = i === currentStep && !done;
            return (
              <div key={i} className={`flex items-center gap-3 transition-all duration-300 ${
                i <= currentStep ? 'opacity-100' : 'opacity-20'
              }`}>
                <Icon className={`w-4 h-4 ${isComplete ? 'text-[#10b981]' : isCurrent ? 'text-[#00d4aa] animate-pulse' : 'text-[#64748b]'}`} />
                <span className={`font-mono text-sm ${isComplete ? 'text-[#10b981]' : 'text-[#94a3b8]'}`}>
                  {isComplete ? '✓' : isCurrent ? '⟳' : '○'} {step.label}
                </span>
              </div>
            );
          })}
        </div>
        {done && (
          <div className="mt-8 animate-fadeIn">
            <p className="text-[#00d4aa] font-mono text-lg tracking-widest">MESH READY</p>
            {!initDone && <p className="text-[#64748b] text-xs mt-2 font-mono">Backend unavailable — local demo mode</p>}
          </div>
        )}
      </div>
    </div>
  );
}
