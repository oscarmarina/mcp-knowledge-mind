export class GetSystemStatusUseCase {
  constructor(docsRepo) {
    this.docsRepo = docsRepo;
  }

  async execute() {
    return await this.docsRepo.getStats();
  }
}
