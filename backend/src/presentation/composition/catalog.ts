import { createCatalogUseCases } from "@/application/use-cases/catalog";
import { postgresCatalogRepository } from "@/infrastructure/postgres/repositories/catalog";

export const catalog = createCatalogUseCases(postgresCatalogRepository);
