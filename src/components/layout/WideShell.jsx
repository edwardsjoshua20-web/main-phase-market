import React from 'react';
import { cn } from '@/lib/utils';

export default function WideShell({ children, className = '' }) {
  return (
    <div className={cn('w-full px-3 md:px-4 lg:px-5 xl:px-6', className)}>
      {children}
    </div>
  );
}
