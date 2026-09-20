'use client';

import { Check, Upload, Languages, Edit3, Volume2, Download } from 'lucide-react';
import { AppStep } from '@/types/transapp';
import { motion } from 'framer-motion';

const STEPS = [
  { num: 1 as AppStep, label: 'Importer SRT', icon: Upload },
  { num: 2 as AppStep, label: 'Traduire', icon: Languages },
  { num: 3 as AppStep, label: 'Réviser', icon: Edit3 },
  { num: 4 as AppStep, label: 'Générer Audio', icon: Volume2 },
  { num: 5 as AppStep, label: 'Exporter', icon: Download },
];

interface StepIndicatorProps {
  currentStep: AppStep;
  completedSteps: Set<AppStep>;
  onStepClick: (step: AppStep) => void;
  canNavigate: (step: AppStep) => boolean;
}

export function StepIndicator({ currentStep, completedSteps, onStepClick, canNavigate }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2 py-4">
      {STEPS.map((step, idx) => {
        const Icon = step.icon;
        const isActive = currentStep === step.num;
        const isCompleted = completedSteps.has(step.num);
        const clickable = canNavigate(step.num);

        return (
          <div key={step.num} className="flex items-center">
            <motion.button
              type="button"
              onClick={() => clickable && onStepClick(step.num)}
              disabled={!clickable}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-primary/20 text-primary border border-primary/40 shadow-md pulse-cyan'
                  : isCompleted
                  ? 'bg-accent/15 text-accent border border-accent/30 cursor-pointer hover:bg-accent/25'
                  : clickable
                  ? 'bg-muted/50 text-muted-foreground border border-border cursor-pointer hover:bg-muted'
                  : 'bg-muted/20 text-muted-foreground/40 border border-transparent cursor-not-allowed'
              }`}
              whileHover={clickable ? { scale: 1.03 } : undefined}
              whileTap={clickable ? { scale: 0.97 } : undefined}
            >
              <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${
                isActive ? 'bg-primary text-primary-foreground' : isCompleted ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'
              }`}>
                {isCompleted && !isActive ? <Check className="w-3.5 h-3.5" /> : step.num}
              </span>
              <Icon className="w-4 h-4 hidden sm:block" />
              <span className="hidden md:inline">{step.label}</span>
            </motion.button>
            {idx < STEPS.length - 1 && (
              <div className={`w-4 sm:w-8 h-0.5 mx-1 rounded ${
                completedSteps.has(step.num) ? 'bg-accent/50' : 'bg-border/50'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
