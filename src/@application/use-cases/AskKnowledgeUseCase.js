export class AskKnowledgeUseCase {
  constructor(docsRepo, embeddingService) {
    this.docsRepo = docsRepo;
    this.embeddingService = embeddingService;
  }

  async execute({ query, limit = 10 }) {
    if (!query) {
      throw new Error('query is required');
    }

    const queryEmbedding = await this.embeddingService.embed(query);
    const results = await this.docsRepo.searchHybrid(
      query,
      queryEmbedding,
      limit,
    );

    return results;
  }
}
