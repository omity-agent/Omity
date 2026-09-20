import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { runTransaction } from "../../src/infrastructure/database/connection";

test("SQLite automatic rollback preserves its original error and releases the transaction", () => {
  using db = new Database(":memory:", { strict: true });
  db.run("CREATE TABLE entries (id INTEGER PRIMARY KEY)");
  db.run(
    `CREATE TRIGGER reject_entry BEFORE INSERT ON entries
     WHEN NEW.id = 2
     BEGIN SELECT RAISE(ROLLBACK, 'automatic rollback'); END`,
  );
  expect(() =>
    runTransaction(db, () => {
      db.run("INSERT INTO entries VALUES (1)");
      db.run("INSERT INTO entries VALUES (2)");
    }),
  ).toThrow("automatic rollback");
  expect(db.inTransaction).toBe(false);
  expect(db.query("SELECT id FROM entries").all()).toEqual([]);
  runTransaction(db, () => {
    db.run("INSERT INTO entries VALUES (3)");
  });
  expect(db.query("SELECT id FROM entries").all()).toEqual([{ id: 3 }]);
});
test("an outer rollback includes successful nested transactions", () => {
  using db = new Database(":memory:", { strict: true });
  db.run("CREATE TABLE entries (id INTEGER PRIMARY KEY)");
  expect(() =>
    runTransaction(db, () => {
      db.run("INSERT INTO entries VALUES (1)");
      runTransaction(db, () => {
        db.run("INSERT INTO entries VALUES (2)");
      });
      throw new Error("outer rollback");
    }),
  ).toThrow("outer rollback");
  expect(db.inTransaction).toBe(false);
  expect(db.query("SELECT id FROM entries").all()).toEqual([]);
});
