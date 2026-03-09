import React, { useState, useEffect } from 'react';
import { Activity, AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react';
import { dynamoMonitor, ThrottleLevel } from '../services/dynamoMonitor';
import { rateLimiter } from '../services/rateLimiter';

export const DynamoDBStatus: React.FC = () => {
  const [usage, setUsage] = useState(dynamoMonitor.getUsageStats());
  const [projection, setProjection] = useState(dynamoMonitor.getMonthlyProjection());
  const [queueStatus, setQueueStatus] = useState(rateLimiter.getQueueStatus());
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Aktualizace každých 5 sekund
    const interval = setInterval(() => {
      setUsage(dynamoMonitor.getUsageStats());
      setProjection(dynamoMonitor.getMonthlyProjection());
      setQueueStatus(rateLimiter.getQueueStatus());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Získání barvy podle procentuálního využití
  const getUsageColor = (percentage: number): string => {
    if (percentage > 95) return 'text-red-500';
    if (percentage > 85) return 'text-orange-500';
    if (percentage > 70) return 'text-yellow-500';
    return 'text-green-500';
  };

  // Získání barvy pozadí podle celkového stavu
  const getBackgroundColor = (): string => {
    const readsPercentage = parseFloat(usage.reads.percentage);
    const writesPercentage = parseFloat(usage.writes.percentage);
    const maxPercentage = Math.max(readsPercentage, writesPercentage);

    if (maxPercentage > 95) return 'bg-red-50 border-red-200';
    if (maxPercentage > 85) return 'bg-orange-50 border-orange-200';
    if (maxPercentage > 70) return 'bg-yellow-50 border-yellow-200';
    return 'bg-green-50 border-green-200';
  };

  // Získání ikony podle stavu
  const getStatusIcon = (): React.ReactNode => {
    const readsPercentage = parseFloat(usage.reads.percentage);
    const writesPercentage = parseFloat(usage.writes.percentage);
    const maxPercentage = Math.max(readsPercentage, writesPercentage);

    if (maxPercentage > 95) return <XCircle size={16} className="text-red-500" />;
    if (maxPercentage > 85) return <AlertTriangle size={16} className="text-orange-500" />;
    if (maxPercentage > 70) return <Clock size={16} className="text-yellow-500" />;
    return <CheckCircle size={16} className="text-green-500" />;
  };

  // Formátování čísel
  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const maxPercentage = Math.max(
    parseFloat(usage.reads.percentage),
    parseFloat(usage.writes.percentage)
  );

  if (!isVisible) {
    // Minimal status indicator
    return (
      <button
        onClick={() => setIsVisible(true)}
        className={`fixed bottom-4 right-4 p-2 rounded-full border ${getBackgroundColor()} shadow-lg transition-all hover:scale-110`}
        title="DynamoDB Status"
      >
        {getStatusIcon()}
      </button>
    );
  }

  return (
    <div className={`fixed bottom-4 right-4 w-80 rounded-lg border shadow-lg p-4 ${getBackgroundColor()}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <h3 className="font-semibold text-sm">DynamoDB Status</h3>
        </div>
        <button
          onClick={() => setIsVisible(false)}
          className="text-gray-500 hover:text-gray-700"
        >
          ×
        </button>
      </div>

      {/* Usage Bars */}
      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span>Read Operations</span>
            <span className={getUsageColor(parseFloat(usage.reads.percentage))}>
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
          <div className="text-xs text-gray-600 mt-1">
            {formatNumber(usage.reads.current)} / {formatNumber(usage.reads.limit)}
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span>Write Operations</span>
            <span className={getUsageColor(parseFloat(usage.writes.percentage))}>
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
          <div className="text-xs text-gray-600 mt-1">
            {formatNumber(usage.writes.current)} / {formatNumber(usage.writes.limit)}
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span>Storage</span>
            <span className={getUsageColor(parseFloat(usage.storage.percentage))}>
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
          <div className="text-xs text-gray-600 mt-1">
            {usage.storage.current}GB / {usage.storage.limit}GB
          </div>
        </div>
      </div>

      {/* Queue Status */}
      {queueStatus.size > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="flex items-center gap-2 text-xs">
            <Activity size={12} />
            <span>Fronta: {queueStatus.size}/{queueStatus.maxSize}</span>
            {queueStatus.nextRequestIn > 0 && (
              <span className="text-gray-600">
                Další za: {Math.ceil(queueStatus.nextRequestIn / 1000)}s
              </span>
            )}
          </div>
        </div>
      )}

      {/* Projection */}
      <div className="mt-3 pt-3 border-t border-gray-200">
        <div className="text-xs">
          <div className="flex justify-between">
            <span>Měsíční predikce:</span>
            <span className={projection.willExceed ? 'text-red-500' : 'text-green-500'}>
              {formatNumber(projection.projected)}
            </span>
          </div>
          {projection.willExceed && (
            <div className="text-red-500 mt-1">
              ⚠️ Predikovan překročení limitu!
            </div>
          )}
          <div className="text-gray-600 mt-1">
            Zbývá {projection.daysRemaining} dní v měsíci
          </div>
        </div>
      </div>

      {/* Status Message */}
      <div className="mt-3 pt-3 border-t border-gray-200">
        <div className="text-xs">
          {maxPercentage > 95 && (
            <div className="text-red-500 font-medium">
              🛑 AI cache dočasně nedostupná
            </div>
          )}
          {maxPercentage > 85 && maxPercentage <= 95 && (
            <div className="text-orange-500 font-medium">
              🕐 AI cache omezena
            </div>
          )}
          {maxPercentage > 70 && maxPercentage <= 85 && (
            <div className="text-yellow-500 font-medium">
              ⚡ AI cache zpomalená
            </div>
          )}
          {maxPercentage <= 70 && (
            <div className="text-green-500 font-medium">
              ✅ AI cache plně funkční
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
