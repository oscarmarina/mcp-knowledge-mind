export class Chunk {
  constructor({ id, docId, header, content, wordCount, embedding, createdAt }) {
    this.id = id;
    this.docId = docId;
    this.header = header;
    this.content = content;
    this.wordCount = wordCount;
    this.embedding = embedding; // Float32Array | null
    this.createdAt = createdAt;
  }
}
