import crypto from 'crypto';
export class AskKnowledgeUseCase {
  constructor(docsRepo, embeddingService) {
    this.docsRepo = docsRepo;
    this.embeddingService = embeddingService;
  }

  async execute({ query, limit = 10 }) {
    if (!query) {
      throw new Error('query is required');
    }

    const model = this.embeddingService.getModelName();
    const hash = crypto
      .createHash('sha256')
      .update(`${model}:${query}`)
      .digest('hex');

    let queryEmbedding = await this.docsRepo.getCachedEmbedding(hash);

    if (!queryEmbedding) {
      queryEmbedding = await this.embeddingService.embed(query);
      await this.docsRepo.cacheEmbedding(hash, query, model, queryEmbedding);
    }

    const results = await this.docsRepo.searchHybrid(
      query,
      queryEmbedding,
      limit,
    );

    return results;
  }
}
