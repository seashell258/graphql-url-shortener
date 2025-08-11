import { nanoid } from "nanoid";
import { GraphQLError } from "graphql";
import { Context, ShortenedURL } from "../typeDefs/types";


export default {
  Query: {
    getUrl: async (
      _: any,
      { shortCode }: { shortCode: string },
      { prisma, redis }: Context
    ): Promise<ShortenedURL | null> => {
      // TODO: handle custom shortCode and ttl

      try {
        // Try to get the URL from Redis cache
        const cachedUrl = await redis.get(shortCode);
        if (cachedUrl) {
          return {
            originalUrl: cachedUrl,
            shortCode,
          };
        }

        // If not in cache, fetch from database
        const url = await prisma.shortenedURL.findUnique({
          where: { shortCode },
        });

        if (url) {
          // Cache the result in Redis
          await redis.set(shortCode, url.originalUrl, "EX", 3600);
          return url;
        }

        throw new GraphQLError("URL not found", {
          extensions: { code: "NOT_FOUND" },
        });
      } catch (error) {
        console.error("Error in getUrl resolver:", error);
        throw new GraphQLError("Failed to retrieve URL", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }
    },
  },
  Mutation: {
    const resolvers = {
      Mutation: {
        createUrl: async (_parent, args, context) => {
          const { originalUrl, shortCode, ttl } = args;

          // 產生 shortCode
          const code = shortCode || nanoid(10);

          // 計算 expiredAt
          let expiredAt: Date | null = null;

          if (ttl) {
            expiredAt = new Date(Date.now() + ttl * 1000);
          }

          // 新增資料到資料庫
          const newUrl = await context.prisma.shortenedURL.create({
            data: {
              originalUrl,
              shortCode: code,
              expiredAt, // 需要在 prisma schema 裡有定義這欄位
            },
          });

          // 快取到 Redis
          await context.redis.set(code, originalUrl);

          return newUrl;
        },
      },

    },

  },
};
    // TODO
    // updateUrl: async (
    //   _: any,
    //   { shortCode, newUrl }: { shortCode: string; newUrl: string },
    //   { prisma, redis }: Context
    // ): Promise<ShortenedURL> => {
    // },
    // deleteUrl: async (
    //   _: any,
    //   { shortCode }: { shortCode: string },
    //   { prisma, redis }: Context
    // ): Promise<boolean> => {
    // },