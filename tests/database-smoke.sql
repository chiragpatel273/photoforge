-- Run only against a disposable migrated database. The fixture is rolled back.
BEGIN;
INSERT INTO "User" (id,email,name) VALUES ('00000000-0000-4000-8000-000000000001','database-smoke@example.invalid','Smoke test');
INSERT INTO "Template" (id,name,category,document) VALUES ('smoke-template','Smoke','Minimal','{}');
INSERT INTO "Photobook" (id,"userId","templateId",title,document,"updatedAt") VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','smoke-template','A memory','{}',CURRENT_TIMESTAMP);
INSERT INTO "PhotobookPage" (id,"bookId",position,content,"updatedAt") VALUES ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002',0,'{}',CURRENT_TIMESTAMP);
UPDATE "Photobook" SET revision=revision+1 WHERE id='00000000-0000-4000-8000-000000000002' AND revision=0;
DO $$ BEGIN IF (SELECT revision FROM "Photobook" WHERE id='00000000-0000-4000-8000-000000000002') <> 1 THEN RAISE EXCEPTION 'Revision update failed'; END IF; END $$;
INSERT INTO "Order" (id,"userId","idempotencyKey","totalCents") VALUES ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000005',2900);
INSERT INTO "OrderItem" (id,"orderId","bookId",title,size,"pageCount","priceCents",document) VALUES ('00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000002','A memory','square',1,2900,'{}');
DELETE FROM "Photobook" WHERE id='00000000-0000-4000-8000-000000000002';
DO $$ BEGIN IF EXISTS (SELECT 1 FROM "PhotobookPage" WHERE id='00000000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'Page cascade failed'; END IF; IF NOT EXISTS (SELECT 1 FROM "OrderItem" WHERE id='00000000-0000-4000-8000-000000000006' AND "bookId" IS NULL AND title='A memory') THEN RAISE EXCEPTION 'Order snapshot did not survive'; END IF; END $$;
DO $$ DECLARE rejected BOOLEAN := false; BEGIN BEGIN INSERT INTO "PhotobookPage" (id,"bookId",position,content,"updatedAt") VALUES ('00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000002',1,'{}',CURRENT_TIMESTAMP); EXCEPTION WHEN foreign_key_violation THEN rejected := true; END; IF NOT rejected THEN RAISE EXCEPTION 'Missing book FK was accepted'; END IF; END $$;
ROLLBACK;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM "User" WHERE id='00000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Transaction rollback failed'; END IF; END $$;
