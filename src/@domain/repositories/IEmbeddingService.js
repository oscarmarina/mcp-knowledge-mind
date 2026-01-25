/**
 * Interface for Embedding Service.
 */
export class IEmbeddingService {
  /**
   * Initialize model/pipeline if needed
   */
  async init() {
    throw new Error('Not implemented');
  }

  /**
   * Generate embedding for text
   * @param {string} text
   * @returns {Promise<Float32Array>}
   */
  async embed(text) {
    throw new Error('Not implemented');
  }

  /**
   * Get main model name
   * @returns {string}
   */
  getModelName() {
    throw new Error('Not implemented');
  }
}
