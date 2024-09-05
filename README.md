<<<<<<< HEAD
# Crypto-Arsenal 後端實習測試

感謝您應徵 Crypto-Arsenal 的後端實習工程師職位！此儲存庫作為線上測試題目使用，請依照以下步驟進行：

1. 將本儲存庫 Clone 至您的開發環境。
2. 建立一個新的 GitHub 私有儲存庫：
   - 前往 https://github.com/new/ ，建立私有儲存庫。
   - 將 twzjwang 設定為協作者
3. 在本地儲存庫設定新的遠端連結：
   - 移除現有遠端： `git remote remove origin`
   - 添加您的儲存庫作為新遠端： `git remote add origin https://github.com/[your-username]/[your-repo].git`
   - 推送所有本地分支： `git push -u origin --all`
4. 開始開發
5. `Git` 題目需在一小時內提交，請將您的儲存庫連結寄至下列信箱 (若不繼續作答也請在信中告知)：
   - richard@crypto-arsenal.io
   - zanjun@crypto-arsenal.io
6. `URL shortener system` 作答時間限時兩週，但完成速度將影響評估，請盡快完成。
7. 完成所有題目後，再次寄送儲存庫連結給我們，歡迎在信件內補充任何說明。

## 注意事項

- 除了 `Git` 題目以外，其他答案請提交至主分支 `main`。
- 請使用清晰的 Git 提交訊息。
- 開發時間計算自開啟測試郵件的時間至最後一次提交，勿試圖篡改提交時間。
- 若遇到非開發問題（包括但不限於網絡問題），請及時告知我們。
- 您可使用 Google、ChatGPT、Stack Overflow 等工具，但面試時須解釋實作原理。
- 您可以引入全新套件，請敘述引入的原因及選擇該套件的原因。

## 題目

請完成以下題目，第一題 (`Git`) 必須在一小時內提交：

- Git
- URL shortener system

### Git

- 請將當前分支對 `main` 分支執行 `git rebase`，並在遇到衝突時，以當前分支的內容覆蓋 `main` 分支中的 `### Git` 部分。
- 操作完成後，將此分支推送至 GitHub。
- 請切回主分支繼續作答其他題目。

### URL shortener system

#### 前置準備

- MySQL Database

(建議使用 docker，以下為參考指令)

```
docker pull mysql:8.3
docker run -d -p 3306:3306 -e MYSQL_ROOT_PASSWORD=password mysql:8.3 --default-authentication-plugin=mysql_native_password
```

- Redis

(建議使用 docker，以下為參考指令)

```
docker pull redis
docker run -d -p 6379:6379 redis
```

- 設置 `.env` 文件

創建一個 `.env` 文件並填入以下內容，可根據您的環境修改：

```
DATABASE_NAME='my_table'
DATABASE_HOST='127.0.0.1'
DATABASE_PORT='3306'
DATABASE_USER='root'
DATABASE_PASSWORD='password'
DATABASE_URL="mysql://${DATABASE_USER}:${DATABASE_PASSWORD}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}"

REDIS_HOST="127.0.0.1"
REDIS_PORT="6379"
REDIS_USER=""
REDIS_PASSWORD=""
```

#### 功能

- 查詢
  - `getUrl`: 使用 shortCode 查詢 originalUrl。
- 變更
  - `createUrl`: 創建 shortCode
    - 若未設定 shortCode，在系統自動生成 10 字元的亂碼作為 shortCode
    - 若未設定 ttl，則不設到期日
    - 若有設定 ttl，shortCode 到期後需要做對應處理
  - `updateUrl`: 更新 shortCode 對應的 originalUrl
  - `deleteUrl`: 刪除 shortCode

#### 技術棧

- GraphQL API (TypeScript + Apollo Server)
  - 實現資料查詢與變更。
- MySQL：主要資料庫。
- Prisma：ORM，提供 type-safe API 與 MySQL 互動。
- Redis：快取頻繁訪問的資料。
- Mocha：單元測試框架。

#### Database Schema

使用 Prisma Migrate 根據需求變更：

```
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model ShortenedURL {
  id          Int      @id @default(autoincrement())
  originalUrl  String
  shortCode   String   @unique
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([originalUrl])
}
```

#### GraphQL Schema

```
scalar Date

type ShortenedURL {
  originalUrl: String!
  shortCode: String!
  # TODO
  # expiredAt: Date!
}

type Query {
  getUrl(shortCode: String!): ShortenedURL
}

type Mutation {
  createUrl(originalUrl: String!, shortCode: String, ttl: Int): ShortenedURL
  # TODO
}
```

#### Redis

合理使用 Redis 快取資料。

#### 測試

使用 Mocha 為開發功能撰寫單元測試，例如：

```
it('should create a new shortened URL', async () => {
   // TODO
});
```

#### 優化（intern 應徵者可選擇性作答）

- 實作 Bloom Filter，用以在查詢 Redis/MySQL 前檢查資料是否存在。
- 其他優化想法

