import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Activity, 
  Database, 
  Clock, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Settings,
  Trash2,
  Download
} from 'lucide-react';
import { dynamoMonitor } from '../services/dynamoMonitor';
import { rateLimiter } from '../services/rateLimiter';
import { dynamoCache } from '../services/dynamoCache';

export const AdminDashboard: React.FC = () => {
  const [usage, setUsage] = useState(dynamoMonitor.getUsageStats());
  const [projection, setProjection] = useState(dynamoMonitor.getMonthlyProjection());
  const [queueStatus, setQueueStatus] = useState(rateLimiter.getQueueStatus());
  const [cacheStats, setCacheStats] = useState(dynamoCache.getCacheStats());
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Aktualizace každých 3 sekundy
    const interval = setInterval(() => {
      setUsage(dynamoMonitor.getUsageStats());
      setProjection(dynamoMonitor.getMonthlyProjection());
      setQueueStatus(rateLimiter.getQueueStatus());
      setCacheStats(dynamoCache.getCacheStats());
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Formátování čísel
  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  // Formátování velikosti
  const formatBytes = (bytes: number): string => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${bytes}B`;
  };

  // Získání barvy podle procenta
  const getStatusColor = (percentage: number): string => {
    if (percentage > 95) return 'text-red-500';
    if (percentage > 85) return 'text-orange-500';
    if (percentage > 70) return 'text-yellow-500';
    return 'text-green-500';
  };

  // Získání barvy pozadí
  const getBackgroundClass = (percentage: number): string => {
    if (percentage > 95) return 'bg-red-50 border-red-200';
    if (percentage > 85) return 'bg-orange-50 border-orange-200';
    if (percentage > 70) return 'bg-yellow-50 border-yellow-200';
    return 'bg-green-50 border-green-200';
  };

  // Export statistik
  const exportStats = () => {
    const stats = {
      timestamp: new Date().toISOString(),
      usage,
      projection,
      queueStatus,
      cacheStats,
      aiCacheEnabled: dynamoMonitor.isAICacheEnabled()
    };

    const blob = new Blob([JSON.stringify(stats, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dynamodb-stats-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Clear cache
  const clearCache = () => {
    if (confirm('Opravdu chcete vymazat veškerou lokální cache?')) {
      dynamoCache.clearCache();
      setCacheStats(dynamoCache.getCacheStats());
    }
  };

  // Optimize cache
  const optimizeCache = () => {
    dynamoCache.optimizeCache();
    setCacheStats(dynamoCache.getCacheStats());
  };

  const maxPercentage = Math.max(
    parseFloat(usage.reads.percentage),
    parseFloat(usage.writes.percentage)
  );

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed top-4 right-4 p-2 bg-gray-800 text-white rounded-lg shadow-lg hover:bg-gray-700 transition-all"
        title="Admin Dashboard"
      >
        <Settings size={16} />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 size={20} />
            <h2 className="text-lg font-semibold">DynamoDB Admin Dashboard</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportStats}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded"
              title="Export statistics"
            >
              <Download size={16} />
            </button>
            <button
              onClick={() => setIsVisible(false)}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Status Overview */}
          <div className={`p-4 rounded-lg border ${getBackgroundClass(maxPercentage)}`}>
            <div className="flex items-center gap-2 mb-2">
              {maxPercentage > 95 ? (
                <XCircle size={20} className="text-red-500" />
              ) : maxPercentage > 85 ? (
                <AlertTriangle size={20} className="text-orange-500" />
              ) : maxPercentage > 70 ? (
                <Clock size={20} className="text-yellow-500" />
              ) : (
                <CheckCircle size={20} className="text-green-500" />
              )}
              <h3 className="font-semibold">System Status</h3>
            </div>
            <p className="text-sm text-gray-600">
              {maxPercentage > 95 && '🛑 Emergency: AI cache disabled'}
              {maxPercentage > 85 && maxPercentage <= 95 && '🕐 Hard throttling active'}
              {maxPercentage > 70 && maxPercentage <= 85 && '⚡ Gentle throttling active'}
              {maxPercentage <= 70 && '✅ All systems operational'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              AI Cache: {dynamoMonitor.isAICacheEnabled() ? 'Enabled' : 'Disabled'}
            </p>
          </div>

          {/* Usage Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Database size={16} />
                <h4 className="font-semibold">Read Operations</h4>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Usage:</span>
                  <span className={getStatusColor(parseFloat(usage.reads.percentage))}>
                    {usage.reads.percentage}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      parseFloat(usage.reads.percentage) > 95
                        ? 'bg-red-500'
                        : parseFloat(usage.reads.percentage) > 85
                        ? 'bg-orange-500'
                        : parseFloat(usage.reads.percentage) > 70
                        ? 'bg-yellow-500'
                        : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(100, parseFloat(usage.reads.percentage))}%` }}
                  />
                </div>
                <div className="text-xs text-gray-600">
                  {formatNumber(usage.reads.current)} / {formatNumber(usage.reads.limit)}
                </div>
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Database size={16} />
                <h4 className="font-semibold">Write Operations</h4>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Usage:</span>
                  <span className={getStatusColor(parseFloat(usage.writes.percentage))}>
                    {usage.writes.percentage}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      parseFloat(usage.writes.percentage) > 95
                        ? 'bg-red-500'
                        : parseFloat(usage.writes.percentage) > 85
                        ? 'bg-orange-500'
                        : parseFloat(usage.writes.percentage) > 70
                        ? 'bg-yellow-500'
                        : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(100, parseFloat(usage.writes.percentage))}%` }}
                  />
                </div>
                <div className="text-xs text-gray-600">
                  {formatNumber(usage.writes.current)} / {formatNumber(usage.writes.limit)}
                </div>
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Database size={16} />
                <h4 className="font-semibold">Storage</h4>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Usage:</span>
                  <span className={getStatusColor(parseFloat(usage.storage.percentage))}>
                    {usage.storage.percentage}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      parseFloat(usage.storage.percentage) > 95
                        ? 'bg-red-500'
                        : parseFloat(usage.storage.percentage) > 85
                        ? 'bg-orange-500'
                        : parseFloat(usage.storage.percentage) > 70
                        ? 'bg-yellow-500'
                        : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(100, parseFloat(usage.storage.percentage))}%` }}
                  />
                </div>
                <div className="text-xs text-gray-600">
                  {usage.storage.current}GB / {usage.storage.limit}GB
                </div>
              </div>
            </div>
          </div>

          {/* Queue Status */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity size={16} />
              <h4 className="font-semibold">Queue Status</h4>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Size:</span>
                <span className="ml-2 font-medium">{queueStatus.size}/{queueStatus.maxSize}</span>
              </div>
              <div>
                <span className="text-gray-600">Processing:</span>
                <span className="ml-2 font-medium">{queueStatus.isProcessing ? 'Yes' : 'No'}</span>
              </div>
              <div>
                <span className="text-gray-600">Next in:</span>
                <span className="ml-2 font-medium">
                  {queueStatus.nextRequestIn > 0 ? `${Math.ceil(queueStatus.nextRequestIn / 1000)}s` : 'Ready'}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Est. wait:</span>
                <span className="ml-2 font-medium">
                  {rateLimiter.getEstimatedWaitTime() > 0 
                    ? `${Math.ceil(rateLimiter.getEstimatedWaitTime() / 1000)}s` 
                    : 'None'}
                </span>
              </div>
            </div>
          </div>

          {/* Cache Statistics */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Database size={16} />
                <h4 className="font-semibold">Cache Statistics</h4>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={optimizeCache}
                  className="p-1 text-blue-600 hover:bg-blue-50 rounded text-sm"
                  title="Optimize cache"
                >
                  <TrendingUp size={14} />
                </button>
                <button
                  onClick={clearCache}
                  className="p-1 text-red-600 hover:bg-red-50 rounded text-sm"
                  title="Clear cache"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Entries:</span>
                <span className="ml-2 font-medium">{cacheStats.totalEntries}</span>
              </div>
              <div>
                <span className="text-gray-600">Size:</span>
                <span className="ml-2 font-medium">{formatBytes(cacheStats.totalSize)}</span>
              </div>
              <div>
                <span className="text-gray-600">Oldest:</span>
                <span className="ml-2 font-medium">
                  {cacheStats.oldestEntry ? `#${cacheStats.oldestEntry}` : 'None'}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Newest:</span>
                <span className="ml-2 font-medium">
                  {cacheStats.newestEntry ? `#${cacheStats.newestEntry}` : 'None'}
                </span>
              </div>
            </div>
          </div>

          {/* Monthly Projection */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={16} />
              <h4 className="font-semibold">Monthly Projection</h4>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Projected reads:</span>
                <span className={projection.willExceed ? 'text-red-500' : 'text-green-500'}>
                  {formatNumber(projection.projected)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Will exceed limit:</span>
                <span className={projection.willExceed ? 'text-red-500' : 'text-green-500'}>
                  {projection.willExceed ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Days remaining:</span>
                <span className="text-gray-600">{projection.daysRemaining}</span>
              </div>
              {projection.willExceed && (
                <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                  <AlertTriangle size={14} className="inline mr-1" />
                  Warning: Projected to exceed monthly limit!
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
