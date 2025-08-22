import Surreal from "surrealdb.js";
import { DateTime } from "luxon";
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: "https://267df2d31a78ac028d196fc7a5ebcdcb@o522135.ingest.sentry.io/4506416306978816",
});

let db = null;

// Connect to SurrealDB and return the instance
export async function connect() {
  if (db) return db;

  db = new Surreal();
  try {
    await db.connect("http://127.0.0.1:8000/rpc", {
      namespace: 'tazman',
      database: 'chatbot',
      auth: {
        username: 'root',
        password: 'root'
      }
    });
    //await db.signin({ user: "root", pass: "root" });
    //await db.use({ namespace: "tazman", database: "chatbot" });
    return db;
  } catch (err) {
    console.error("Failed to connect to SurrealDB:", err?.message || err);
    await db.close();
    db = null;
    throw err;
  }
}

// Internal helper to always get a working db instance
async function getDb() {
  return await connect();
}

// === Player Functions ===

export async function findPlayer(id) {
  try {
    const db = await getDb();
    return await db.select(`player:⟨${id}⟩`);
  } catch (e) {
    console.log("cannot find player", e?.message || e);
    Sentry.captureException(e);
  }
}

export async function createPlayer(id, values) {
  try {
    const db = await getDb();
    return await db.create(`player:⟨${id}⟩`, {
      ...values,
      lastActiveAt: DateTime.now().toISO(),
    });
  } catch (e) {
    console.log("cannot create player", e?.message || e);
    Sentry.captureException(e);
  }
}

export async function savePlayer(id, values) {
  console.log('saving player')
  try {
    const db = await getDb();
    const res = await db.merge(`player:⟨${id}⟩`, {
      ...values,
      lastActiveAt: DateTime.now().toISO(),
    });
    console.log('player saved', res)
    return res;
  } catch (e) {
    console.log("cannot save player", e?.message || e);
    Sentry.captureException(e);
  }
}

export async function deletePlayer(id) {
  try {
    const db = await getDb();
    return await db.delete(`player:⟨${id}⟩`);
  } catch (e) {
    console.log("cannot delete player", e?.message || e);
    Sentry.captureException(e);
  }
}
