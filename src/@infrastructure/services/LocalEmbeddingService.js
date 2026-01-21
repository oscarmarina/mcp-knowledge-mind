import { pipeline } from '@xenova/transformers';
import { IEmbeddingService } from '../../@domain/repositories/IEmbeddingService.js';

export class LocalEmbeddingService extends IEmbeddingService {
  constructor(model = 'nomic-ai/nomic-embed-text-v1.5') {
    super();
    this.model = model;
    this.pipe = null;
  }

  async init() {
    this.pipe = await pipeline('feature-extraction', this.model);
  }

  async embed(text) {
    if (!this.pipe) {
      await this.init();
    }
    const output = await this.pipe(text, {
      pooling: 'mean',
      normalize: true,
    });
    return output.data; // Float32Array
  }

  getModelName() {
    return this.model;
  }
}
