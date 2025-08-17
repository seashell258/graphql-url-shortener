import express from 'express';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { loadFiles } from '@graphql-tools/load-files';
import { makeExecutableSchema } from '@graphql-tools/schema';
import path from 'path';

const prisma = new PrismaClient();
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '16386'), //@seashell: 真值就用左邊。 不是 or 

});

async function initBloomFilter() {
  try {
    // 建立 Bloom Filter，如果已存在就跳過
    await redis.call("BF.RESERVE", "shortUrlFilter", 0.01, 1000000);
    console.log("✅ Bloom Filter initialized");
  } catch (e: any) {
    if (e.message.includes("exists")) {
      console.log("ℹ️ Bloom Filter already exists");
    } else {
      throw e;
    }
  }
}


async function startServer() {
  await initBloomFilter();
  const typeDefs = await loadFiles(path.join(__dirname, './typeDefs/*.graphql'));
  const resolvers = await loadFiles(path.join(__dirname, './resolvers/*.ts'));

  const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
  });

  const server = new ApolloServer({
    schema,
  });

  await server.start();

  const app = express();
  app.use(express.json());

  app.use('/graphql', expressMiddleware(server, {
    context: async () => ({ prisma, redis }),
  }));

  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}/graphql`);
  });
}

startServer().catch((error) => {
  console.error('Error starting server:', error);
});