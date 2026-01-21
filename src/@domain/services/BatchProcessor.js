/**
 * BatchProcessor - Domain service for processing items in batches with concurrency control
 *
 * This service helps manage resource usage and API rate limits by processing
 * items in controlled batches rather than all at once.
 */
export class BatchProcessor {
  /**
   * Calculate optimal batch size based on total number of items
   *
   * Uses square root heuristic for balanced concurrency:
   * - Small datasets (10-50 items): 5-7 concurrent
   * - Medium datasets (100-200 items): 10-14 concurrent
   * - Large datasets (500+ items): 20 concurrent (capped)
   *
   * @param {number} totalItems - Total number of items to process
   * @param {number} minBatch - Minimum batch size (default: 5)
   * @param {number} maxBatch - Maximum batch size (default: 20)
   * @returns {number} Optimal batch size
   */
  static calculateOptimalBatchSize(totalItems, minBatch = 5, maxBatch = 20) {
    if (totalItems <= 0) return minBatch;

    // Use square root for sublinear growth
    const calculated = Math.ceil(Math.sqrt(totalItems));

    // Clamp between min and max
    return Math.min(Math.max(calculated, minBatch), maxBatch);
  }

  /**
   * Process an array of items in batches with concurrency control
   *
   * @param {Array} items - Array of items to process
   * @param {number} batchSize - Number of items to process concurrently
   * @param {Function} processFn - Async function to process each item
   * @param {Function} onBatchComplete - Optional callback after each batch completes
   * @returns {Promise<void>}
   *
   * @example
   * await BatchProcessor.processBatch(files, 5, async (file) => {
   *   // Process each file
   *   await indexFile(file);
   * }, (processed, total) => {
   *   console.log(`Progress: ${processed}/${total}`);
   * });
   */
  static async processBatch(
    items,
    batchSize,
    processFn,
    onBatchComplete = null,
  ) {
    let processedCount = 0;

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      await Promise.all(batch.map(processFn));

      processedCount += batch.length;

      // Call progress callback if provided
      if (onBatchComplete) {
        onBatchComplete(processedCount, items.length);
      }
    }
  }

  /**
   * Process items with automatic batch size calculation
   *
   * @param {Array} items - Array of items to process
   * @param {Function} processFn - Async function to process each item
   * @param {Object} options - Optional configuration
   * @param {number} options.minBatch - Minimum batch size (default: 5)
   * @param {number} options.maxBatch - Maximum batch size (default: 20)
   * @returns {Promise<void>}
   *
   * @example
   * await BatchProcessor.processWithOptimalBatch(files, async (file) => {
   *   await indexFile(file);
   * });
   */
  static async processWithOptimalBatch(items, processFn, options = {}) {
    const { minBatch = 5, maxBatch = 20 } = options;
    const batchSize = BatchProcessor.calculateOptimalBatchSize(
      items.length,
      minBatch,
      maxBatch,
    );

    await BatchProcessor.processBatch(items, batchSize, processFn);
  }
}
