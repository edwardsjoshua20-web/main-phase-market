import React from 'react';
import { cn } from '@/lib/utils';

export default function ContentShellNarrow({ children, className = '' }) {
  return (
    <div className={cn('w-full max-w-[960px] mx-auto px-4 md:px-5 lg:px-6', className)}>
      {children}
    </div>
  );
}