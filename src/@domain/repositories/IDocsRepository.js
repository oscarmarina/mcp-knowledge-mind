/**
 * Interface for Docs Repository.
 * Using a class with throws to simulate an interface in JS.
 */
export class IDocsRepository {
  async init() {
    throw new Error('Not implemented');
  }
  async saveDoc(doc) {
    throw new Error('Not implemented');
  }
  async saveChunks(docId, chunks) {
    throw new Error('Not implemented');
  }
  async searchHybrid(query, queryEmbedding, limit) {
    throw new Error('Not implemented');
  }
  async getStats() {
    throw new Error('Not implemented');
  }
  async cleanup() {
    throw new Error('Not implemented');
  }
  async getCachedEmbedding(hash) {
    throw new Error('Not implemented');
  }
  async cacheEmbedding(hash, text, model, embedding) {
    throw new Error('Not implemented');
  }
}
