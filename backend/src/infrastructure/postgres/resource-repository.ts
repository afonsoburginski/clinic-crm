import * as resources from "../../application/resources"
import type { ResourceRepository } from "../../application/ports/resource-repository"

export const postgresResourceRepository: ResourceRepository = {
  list: resources.listResource,
  get: resources.getResource,
  save: resources.saveResource,
}
