export class Doc {
  constructor({
    id,
    repoOwner,
    repoName,
    path,
    sha,
    content,
    sourceType,
    indexedAt,
  }) {
    this.id = id;
    this.repoOwner = repoOwner;
    this.repoName = repoName;
    this.path = path;
    this.sha = sha;
    this.content = content;
    this.sourceType = sourceType; // 'github' | 'local'
    this.indexedAt = indexedAt;
  }
}
