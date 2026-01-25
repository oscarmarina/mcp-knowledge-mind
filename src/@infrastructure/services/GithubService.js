import { Octokit } from '@octokit/rest';
import { PDFParse } from 'pdf-parse';

export class GithubService {
  constructor(token) {
    this.octokit = new Octokit({ auth: token });
  }

  async getTree(owner, repo, branch = 'main') {
    const { data } = await this.octokit.git.getTree({
      owner,
      repo,
      tree_sha: branch,
      recursive: true,
    });
    return data.tree;
  }

  async getFileContent(owner, repo, fileSha, filePath) {
    const blob = await this.octokit.git.getBlob({
      owner,
      repo,
      file_sha: fileSha,
    });

    if (filePath.endsWith('.pdf')) {
      const buffer = Buffer.from(blob.data.content, 'base64');
      const parser = new PDFParse({ data: buffer });
      const pdfData = await parser.getText();
      return pdfData.text;
    } else {
      return Buffer.from(blob.data.content, 'base64').toString('utf8');
    }
  }
}
