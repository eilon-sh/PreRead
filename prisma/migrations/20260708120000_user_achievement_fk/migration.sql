-- Remove orphaned user achievement rows before adding FK
DELETE FROM "user_achievements" ua
WHERE NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = ua."userId");

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
