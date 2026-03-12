import { useEffect } from 'react';

// AI Cancellation utilities
export class AICancellationManager {
  private static controllers = new Map<string, AbortController>();

  // Create new controller for operation
  static createController(operationId: string): AbortController {
    // Cancel any existing operation with same ID
    this.cancelOperation(operationId);
    
    const controller = new AbortController();
    this.controllers.set(operationId, controller);
    return controller;
  }

  // Cancel specific operation
  static cancelOperation(operationId: string): void {
    const controller = this.controllers.get(operationId);
    if (controller) {
      controller.abort();
      this.controllers.delete(operationId);
      console.log(`🛑 AI operation cancelled: ${operationId}`);
    }
  }

  // Cancel all operations
  static cancelAllOperations(): void {
    console.log(`🛑 Cancelling ${this.controllers.size} AI operations...`);
    this.controllers.forEach(controller => controller.abort());
    this.controllers.clear();
  }

  // Check if operation was cancelled
  static isCancelled(operationId: string): boolean {
    const controller = this.controllers.get(operationId);
    return controller?.signal.aborted || false;
  }

  // Cleanup completed operation
  static cleanupOperation(operationId: string): void {
    this.controllers.delete(operationId);
  }

  // Get active operations count
  static getActiveCount(): number {
    return this.controllers.size;
  }
}

// Hook for component-level cancellation
export const useAICancellation = (componentId: string) => {
  useEffect(() => {
    return () => {
      // Cancel all operations when component unmounts
      AICancellationManager.cancelAllOperations();
    };
  }, [componentId]);
};
