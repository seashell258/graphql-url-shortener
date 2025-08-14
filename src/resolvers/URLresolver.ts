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
      //@seashell: 不太懂 來取 url 的應該都是有隨機十位數的url 或是當時自己輸入的 shorcode 
      // 原本就算有 handle啦？　不知道意思
      // ttl 可以理解 應該就是如果這個網址 expire了 get url 應該就要取不到資料了。 
      // 應該就是資料庫要定期清理。 把資料刪掉

      try {
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
    createUrl: async (
      _,
      { originalUrl, shortCode, ttl }: { originalUrl: string; shortCode?: string; ttl?: number },
      { prisma, redis }: Context
    ): Promise<ShortenedURL> => {
      try {
        // fill shortCode when it's null
        const shortURL = shortCode || nanoid(10);

        // 計算 expiredAt
        let expiredAt: Date | null = null;

        if (ttl) {
          expiredAt = new Date(Date.now() + ttl * 1000);
        }

        // 新增資料到資料庫
        const newUrl = await prisma.shortenedURL.create({
          data: {
            originalUrl,
            shortCode: shortURL,
            expiredAt, // 需要在 prisma schema 裡有定義這欄位
          },
        });

        // 快取到 Redis
        await redis.set(shortURL, originalUrl);

        return newUrl;
      } catch (error) {
        console.error(error);
        throw new GraphQLError("Failed to create URL", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        })
      }
    },
    updateUrl: async (
      _: any,
      { shortCode, newUrl }: { shortCode: string; newUrl: string },
      { prisma, redis }: Context
    ): Promise<ShortenedURL> => {
      try {
        // 先確認資料庫裡有這個 shortCode
        const existing = await prisma.shortenedURL.findUnique({
          where: { shortCode },
        });

        if (!existing) {
          throw new GraphQLError("URL not found", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        // 更新資料庫
        const updated = await prisma.shortenedURL.update({
          where: { shortCode },
          data: { originalUrl: newUrl },
        });

        // 更新 Redis 快取
        // 如果有 TTL，可以選擇重新設置過期時間，這裡假設 1 小時
        await redis.set(shortCode, newUrl, "EX", 3600);

        return updated;
      } catch (error) {
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
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        // shortCode 和 originalUrl 至少要有一個。 用其中一個當條件去刪除資料庫的一筆資料
        const existing = await prisma.shortenedURL.findFirst({
          where: { 
            OR: [  // or 符合陣列其一就會被選中，
              shortCode ? { shortCode } : undefined,
              originalUrl ? { originalUrl } : undefined,
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
        console.error("Error in deleteUrl resolver:", error);
        throw new GraphQLError("Failed to delete URL", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }
    }

  },

}
