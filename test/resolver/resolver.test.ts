import { graphql, GraphQLSchema } from "graphql";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { describe, it, before, after } from "mocha";
import should from "should";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import { loadFiles } from "@graphql-tools/load-files";
import path from "path";
import { Context } from "../../src/typeDefs/types";

let schema: GraphQLSchema;
let prisma: PrismaClient;
let redis: Redis;

before(async () => {
  const typeDefs = await loadFiles(
    path.join(__dirname, "../../src/typeDefs/*.graphql")
  );
  const resolvers = await loadFiles(
    path.join(__dirname, "../../src/resolvers/*.ts")
  );
  schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  });

  prisma = new PrismaClient();
  await prisma.$connect();

  redis = new Redis({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || "16386"),
    username: process.env.REDIS_USER,
    password: process.env.REDIS_PASSWORD,
  });

  // 初始化 Bloom Filter
  try {
    await redis.call("BF.RESERVE", "shortUrlFilter", 0.01, 1000000);
  } catch (e: any) {
    if (!e.message.includes("exists")) throw e;
  }
});

after(async () => {
  await prisma.$disconnect();
  await redis.quit();
});

describe("URL Shortener Resolvers", () => {
  let context: Context;

  beforeEach(async () => {
    await prisma.shortenedURL.deleteMany();
    await redis.flushall("ASYNC");

    context = { prisma, redis };


  });
  //#region create // 沒有斜線的會被轉址到有斜線的版本，因為有斜線才代表是 directory
  //@seashell: from graphql and from database / redis
  it("should create a new shortened URL", async () => {
    const query = `
      mutation {
        createUrl(originalUrl: "https://example.com") {
          originalUrl
          shortCode
        }
      }
    `;

    const result: any = await graphql({
      schema,
      source: query,
      contextValue: context,
    });

    should.not.exist(result.errors);
    should.exist(result.data);
    should.equal(result.data.createUrl.originalUrl, "https://example.com/");

    const savedUrl = await prisma.shortenedURL.findUnique({
      where: { shortCode: result.data.createUrl.shortCode },
    });
    should.exist(savedUrl);
    should.equal(savedUrl?.originalUrl, "https://example.com/");
    should.equal(savedUrl?.shortCode, result.data.createUrl.shortCode);

    const cachedUrl = await redis.get(result.data.createUrl.shortCode);
    should.equal(cachedUrl, "https://example.com/");
  });
  //endregion

  //#region get
  it("should get an existing URL", async () => {
    // 先建立一筆資料
    const created = await prisma.shortenedURL.create({
      data: { originalUrl: "https://get-test.com", shortCode: "get123" },
    });
    await redis.set(created.shortCode, created.originalUrl);
    await redis.call("BF.ADD", "shortUrlFilter", created.shortCode);
    
    const query = `
    query {
      getUrl(shortCode: "get123") {
        originalUrl
        shortCode
      }
    }
  `;

    const result: any = await graphql({
      schema,
      source: query,
      contextValue: context,
    });

    should.not.exist(result.errors);
    should.exist(result.data);
    should.equal(result.data.getUrl.originalUrl, "https://get-test.com");
    should.equal(result.data.getUrl.shortCode, "get123");
  });
  //#endregion
  //#region update    沒有測快取，因為 update 之後選擇刪掉快取資料，避免更新後 database 與 redis資料不同步 
  it("should update an existing URL", async () => {
    const created = await prisma.shortenedURL.create({
      data: { originalUrl: "https://old.com", shortCode: "upd123" },
    });
    await redis.set(created.shortCode, created.originalUrl);

    const mutation = `
    mutation {
      updateUrl(shortCode: "upd123", newUrl: "https://new.com") {
        originalUrl
        shortCode
      }
    }
  `;

    const result: any = await graphql({
      schema,
      source: mutation,
      contextValue: context,
    });

    should.not.exist(result.errors);
    should.exist(result.data);
    should.equal(result.data.updateUrl.originalUrl, "https://new.com/");
    should.equal(result.data.updateUrl.shortCode, "upd123");

    const updated = await prisma.shortenedURL.findUnique({
      where: { shortCode: "upd123" },
    });
    should.equal(updated?.originalUrl, "https://new.com/");

  });
  //#region delete
  it("should delete an existing URL", async () => {
    const created = await prisma.shortenedURL.create({
      data: { originalUrl: "https://delete.com", shortCode: "del123" },
    });
    await redis.set(created.shortCode, created.originalUrl);

    const mutation = `
    mutation {
      deleteUrl(shortCode: "del123")
    }
  `;

    const result: any = await graphql({
      schema,
      source: mutation,
      contextValue: context,
    });

    should.not.exist(result.errors);
    should.exist(result.data);
    should.equal(result.data.deleteUrl, true);

    const deleted = await prisma.shortenedURL.findUnique({
      where: { shortCode: "del123" },
    });
    should.not.exist(deleted);

    const cached = await redis.get("del123");
    should.not.exist(cached);
  });
});
//#endregion