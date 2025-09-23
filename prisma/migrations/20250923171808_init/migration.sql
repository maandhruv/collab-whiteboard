/*
  Warnings:

  - A unique constraint covering the columns `[accessCode]` on the table `Whiteboard` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Whiteboard" ADD COLUMN "lastOpenedAt" DATETIME;

-- CreateIndex
CREATE UNIQUE INDEX "Whiteboard_accessCode_key" ON "Whiteboard"("accessCode");
