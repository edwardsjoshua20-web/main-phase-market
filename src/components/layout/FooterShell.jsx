import React from 'react';
import { cn } from '@/lib/utils';

export default function FooterShell({ children, className = '' }) {
  return (
    <div className={cn('w-full px-4 md:px-5 lg:px-6 xl:px-8', className)}>
      {children}
    </div>
  );
}
