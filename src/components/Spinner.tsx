import { Loader2 } from 'lucide-react';

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center justify-center animate-spin text-blue-600 ${className}`}> 
      <Loader2 size={32} />
    </span>
  );
}
