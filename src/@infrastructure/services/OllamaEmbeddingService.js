import ollama from 'ollama';
import { IEmbeddingService } from '../../@domain/repositories/IEmbeddingService.js';

export class OllamaEmbeddingService extends IEmbeddingService {
  constructor(model = 'nomic-embed-text', maxChars = 8000) {
    super();
    this.model = model;
    this.maxChars = maxChars;
  }

  async init() {
    // Check if ollama is available
    await ollama.list();
    return true;
  }

  async embed(text) {
    const limitedText =
      text.length > this.maxChars ? text.substring(0, this.maxChars) : text;

    const response = await ollama.embeddings({
      model: this.model,
      prompt: limitedText,
    });

    if (!response.embedding || !Array.isArray(response.embedding)) {
      throw new Error('Invalid embedding response from Ollama');
    }
    return new Float32Array(response.embedding);
  }

  getModelName() {
    return this.model;
  }
}
