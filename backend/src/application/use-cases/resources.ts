import type { ResourceRepository } from "../ports/resource-repository"

export function createResourceUseCases(repository: ResourceRepository) {
  return {
    list: repository.list.bind(repository),
    get: repository.get.bind(repository),
    save: repository.save.bind(repository),
  }
}
