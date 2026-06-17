import React from 'react';
import ContentShellWide from '@/components/layout/ContentShellWide';

export default function HomepageContentShell({ children, className = '' }) {
  return <ContentShellWide className={className}>{children}</ContentShellWide>;
}