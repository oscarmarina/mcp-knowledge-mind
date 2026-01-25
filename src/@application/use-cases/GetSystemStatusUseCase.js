export class GetSystemStatusUseCase {
  constructor(docsRepo, logger = null) {
    this.docsRepo = docsRepo;
    this.logger = logger || {
      info: () => {},
      error: () => {},
      progress: () => {},
    };
  }

  async execute() {
    return await this.docsRepo.getStats();
  }
}
