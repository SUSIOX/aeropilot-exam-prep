export function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${bytes}B`;
}

export function getStatusColor(percentage: number): string {
  if (percentage > 95) return 'text-red-500';
  if (percentage > 85) return 'text-orange-500';
  if (percentage > 70) return 'text-yellow-500';
  return 'text-green-500';
}

export function getStatusBackgroundClass(percentage: number): string {
  if (percentage > 95) return 'bg-red-50 border-red-200';
  if (percentage > 85) return 'bg-orange-50 border-orange-200';
  if (percentage > 70) return 'bg-yellow-50 border-yellow-200';
  return 'bg-green-50 border-green-200';
}
