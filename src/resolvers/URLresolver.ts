import { nanoid } from "nanoid";
import { GraphQLError } from "graphql";
import { Context, ShortenedURL } from "../typeDefs/types";
import { normalizeUrl } from "./utils/normalizeUrl";

export default {
  Query: {
    getUrl: async (
      _: any,
      { shortCode }: { shortCode: string },
      { prisma, redis }: Context
    ): Promise<ShortenedURL | null> => {
      try {
        const exists = await redis.call("BF.EXISTS", "shortUrlFilter", shortCode);

        if (exists === 0) {
          throw new GraphQLError("URL not found", { extensions: { code: "NOT_FOUND" } });
        }
        // Try to get the URL from Redis cache
        const cachedUrl = await redis.get(shortCode);
        if (cachedUrl) {
          console.log("from redis cache") //@seashell: 
          return {
            originalUrl: cachedUrl,
            shortCode,
          };
        }

        // If not in cache, fetch from database
        const url = await prisma.shortenedURL.findUnique({
          where: { shortCode },
        });
        console.log("from database ")//@seashell: 

        if (url) {
          // Cache the result in Redis for an hour
          await redis.set(shortCode, url.originalUrl, "EX", 3600);
          return url;
        }

        throw new GraphQLError("URL not found", {
          extensions: { code: "NOT_FOUND" },
        });
      } catch (error) {
        if (error instanceof GraphQLError) {
          throw error
        }
        console.error("Error in getUrl resolver:", error);
        throw new GraphQLError("Failed to retrieve URL", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }
    },
  },
  Mutation: {
    createUrl: async (
      _,
      { originalUrl, shortCode, ttl }: { originalUrl: string; shortCode?: string; ttl?: number },
      { prisma, redis }: Context
    ): Promise<ShortenedURL> => {
      const normalizedUrl = normalizeUrl(originalUrl)
      try {
        // fill shortCode when it's null
        const shortURL = shortCode || nanoid(10);
        let expiredAt: Date | null = null;
        expiredAt = ttl ? new Date(Date.now() + ttl * 1000) : null;
        const newUrl = await prisma.shortenedURL.create({
          data: {
            originalUrl: normalizedUrl,
            shortCode: shortURL,
            expiredAt,
          },
        });

        if (ttl) {
          // 快取到 Redis，用 EX  => 以秒為單位
          await redis.set(shortURL, normalizedUrl, "EX", ttl);
        }
        else {
          await redis.set(shortURL, normalizedUrl);
        }

        try {
          await redis.call("BF.ADD", "shortUrlFilter", shortURL);
        } catch (e: any) {
          console.error("Bloom Filter error:", e.message);
        }

        return newUrl;
      } catch (error) {
        if (error instanceof GraphQLError) {
          throw error
        }
        console.error("Error in getUrl resolver:", error);
        throw new GraphQLError("Failed to retrieve URL", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }
    },
    updateUrl: async (
      _: any,
      { shortCode, newUrl, ttl }: { shortCode: string; newUrl: string; ttl?: number },
      { prisma, redis }: Context
    ): Promise<ShortenedURL> => {
      const normalizedNewUrl = normalizeUrl(newUrl)

      try {
        // 先確認資料庫裡有這個 shortCode
        const existing = await prisma.shortenedURL.findUnique({
          where: { shortCode: shortCode },
        });

        if (!existing) {
          throw new GraphQLError("URL not found by the shortCode", {
            extensions: { code: "NOT_FOUND" },
          });
        }


        const newExpiredAt = ttl ? new Date(Date.now() + ttl * 1000) : null;
        if (ttl) {
          await redis.del(shortCode);
          await redis.set(shortCode, newUrl, "EX", ttl);

        }

        // 更新資料庫
        const updated = await prisma.shortenedURL.update({
          where: { shortCode: shortCode },
          data: {
            originalUrl: normalizedNewUrl,
            ...(newExpiredAt && { expiredAt: newExpiredAt }), //有 ttl 才會更新。 沒有就不更新
          },
        });


        return updated;

      } catch (error) {
        // 檢查錯誤是否為 GraphQLError，如果是，直接拋出
        if (error instanceof GraphQLError) {
          throw error;
        }

        // 如果是其他類型的錯誤（例如資料庫錯誤），則視為內部伺服器錯誤
        console.error("Error in updateUrl resolver:", error);
        throw new GraphQLError("Failed to update URL", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }
    },
    deleteUrl: async (
      _: any,
      { shortCode, originalUrl }: { shortCode?: string; originalUrl?: string },
      { prisma, redis }: Context
    ): Promise<boolean> => {
      try {
        if (!shortCode && !originalUrl) {
          throw new GraphQLError("Must provide shortCode or originalUrl", {
            extensions: { code: "NO SHORTCODE OR ORIGINALURL" },
          });
        }

        const normalizedUrl = originalUrl ? normalizeUrl(originalUrl) : undefined;

        // shortCode 和 originalUrl 至少要有一個。 用其中一個當條件去刪除資料庫的一筆資料
        const existing = await prisma.shortenedURL.findFirst({
          where: {
            OR: [  // or 符合陣列其一就會被選中，
              shortCode ? { shortCode: shortCode } : undefined,
              normalizedUrl ? { originalUrl: normalizedUrl } : undefined,
            ].filter(Boolean) as any[], // 陣列中只有真值 ( user 的 input )。
          },
        });

        if (!existing) {
          throw new GraphQLError("URL not found", {
            extensions: { code: "NOT_FOUND" },
          });
        }
        // 刪除資料庫
        await prisma.shortenedURL.delete({
          where: { shortCode: existing.shortCode },
        });

        // 刪除 Redis 快取
        await redis.del(existing.shortCode);

        return true;
      } catch (error) {
        if (error instanceof GraphQLError) {
          throw error
        }
        console.error("Error in getUrl resolver:", error);
        throw new GraphQLError("Failed to retrieve URL", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }
    }

  },

}
