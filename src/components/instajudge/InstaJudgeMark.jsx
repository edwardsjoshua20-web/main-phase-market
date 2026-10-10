import React from 'react';
import { Landmark } from 'lucide-react';

const SIZE_CLASSES = Object.freeze({
  sm: 'h-9 w-10',
  md: 'h-11 w-12',
  lg: 'h-14 w-16',
  xl: 'h-[4.75rem] w-[5.5rem] sm:h-[5.5rem] sm:w-[6.5rem]'
});

export default function InstaJudgeMark({ size = 'md', className = '' }) {
  return (
    <span
      className={`relative grid shrink-0 place-items-center ${SIZE_CLASSES[size] || SIZE_CLASSES.md} ${className}`}
      aria-hidden="true"
    >
      <span className="absolute inset-x-[8%] inset-y-[4%] bg-gradient-to-br from-sky-300 via-blue-500 to-cyan-300 shadow-[0_0_28px_rgba(56,189,248,0.18)] [clip-path:polygon(18%_0,82%_0,100%_18%,100%_70%,77%_70%,55%_100%,55%_80%,18%_80%,0_62%,0_18%)]" />
      <span className="absolute inset-x-[15%] inset-y-[11%] bg-[#07101d] [clip-path:polygon(18%_0,82%_0,100%_18%,100%_66%,73%_66%,52%_94%,52%_76%,18%_76%,0_58%,0_18%)]" />
      <span className="relative grid h-[52%] w-[52%] place-items-center border-y border-sky-200/50 text-sky-100">
        <Landmark className="h-full w-full stroke-[1.8]" />
      </span>
    </span>
  );
}
