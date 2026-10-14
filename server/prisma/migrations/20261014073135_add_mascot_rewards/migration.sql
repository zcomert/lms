-- CreateTable
CREATE TABLE "MascotItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slot" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "minStreak" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "UserMascotItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "equipped" BOOLEAN NOT NULL DEFAULT false,
    "acquiredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserMascotItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserMascotItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MascotItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PointTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PointTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UserMascotItem_userId_itemId_key" ON "UserMascotItem"("userId", "itemId");

-- CreateIndex
CREATE INDEX "PointTransaction_userId_idx" ON "PointTransaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PointTransaction_userId_reason_refKey_key" ON "PointTransaction"("userId", "reason", "refKey");

-- Katalog seed
INSERT INTO "MascotItem" ("id","slot","name","description","price","minStreak","sortOrder","active") VALUES
('hat-beret','HAT','Ressam Beresi','Maskotuna sanatçı havası katan şık bir bere.',40,0,1,1),
('hat-graduation','HAT','Mezuniyet Kepi','Düzenli çalışanlara özel mezuniyet kepi.',120,7,2,1),
('glasses-round','GLASSES','Yuvarlak Gözlük','Klasik yuvarlak çerçeveli gözlük.',30,0,3,1),
('glasses-star','GLASSES','Yıldız Gözlük','Yıldız şeklinde parlak çerçeveli gözlük.',80,3,4,1),
('neck-scarf','NECK','Kırmızı Atkı','Sıcacık kırmızı bir atkı.',35,0,5,1),
('neck-bowtie','NECK','Papyon','Zarif bir papyon.',60,0,6,1),
('aura-sparkle','AURA','Parıltı','Maskotunun çevresinde parlayan ışıltılar.',90,3,7,1),
('aura-flame','AURA','Ateş Halkası','Uzun serilerin ödülü: alevli bir hale.',200,14,8,1);
