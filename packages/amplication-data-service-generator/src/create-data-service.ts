import * as fs from "fs";
import * as path from "path";

import winston from "winston";
import fg from "fast-glob";

import { formatCode, Module } from "./util/module";
import { getEntityIdToName } from "./util/entity";
import { createResourcesModules } from "./resource/create-resource";
import { createAppModule } from "./app-module/create-app-module";
import { createPrismaSchemaModule } from "./prisma/create-prisma-schema-module";
import { Entity, Role } from "./types";
import { createGrantsModule } from "./create-grants";

const STATIC_DIRECTORY = path.resolve(__dirname, "static");

const defaultLogger = winston.createLogger({
  transports: [new winston.transports.Console()],
});

export async function createDataService(
  entities: Entity[],
  roles: Role[],
  logger: winston.Logger = defaultLogger
): Promise<Module[]> {
  logger.info("Creating application...");
  const timer = logger.startTimer();
  const staticModules = await readStaticModules(logger);

  const dynamicModules = await createDynamicModules(
    entities,
    roles,
    staticModules,
    logger
  );

  timer.done({ message: "Application creation time" });

  return [...staticModules, ...dynamicModules];
}

async function createDynamicModules(
  entities: Entity[],
  roles: Role[],
  staticModules: Module[],
  logger: winston.Logger
): Promise<Module[]> {
  const entityIdToName = getEntityIdToName(entities);

  logger.info("Creating resources...");
  const resourcesModules = await createResourcesModules(
    entities,
    entityIdToName,
    logger
  );

  logger.info("Creating application module...");
  const appModule = await createAppModule(resourcesModules, staticModules);

  const createdModules = [...resourcesModules, appModule];

  logger.info("Formatting code...");
  const formattedModules = createdModules.map((module) => ({
    ...module,
    code: formatCode(module.code),
  }));

  logger.info("Creating Prisma schema...");
  const prismaSchemaModule = await createPrismaSchemaModule(
    entities,
    entityIdToName
  );

  logger.info("Creating access control grants...");
  const grantsModule = createGrantsModule(entities, roles);

  return [...formattedModules, prismaSchemaModule, grantsModule];
}

async function readStaticModules(logger: winston.Logger): Promise<Module[]> {
  logger.info("Copying static modules...");
  const staticModules = await fg(`${STATIC_DIRECTORY}/**/*`, {
    absolute: false,
    dot: true,
  });

  return Promise.all(
    staticModules.map(async (module) => ({
      path: module.replace(STATIC_DIRECTORY + path.sep, ""),
      code: await fs.promises.readFile(module, "utf-8"),
    }))
  );
}
