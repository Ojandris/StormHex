const { MongoClient, ServerApiVersion } = require('mongodb');

const uri = process.env.MONGODB_URI;

// 8-second timeout for all MongoDB socket operations
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  connectTimeoutMS: 8000,
  socketTimeoutMS: 8000,
  serverSelectionTimeoutMS: 8000,
});

let db;

async function connectDB() {
  if (db) return db;

  try {
    await client.connect();
    console.log("✅ Connecté à MongoDB");
    db = client.db("discordBot");
    return db;
  } catch (err) {
    console.error("[BanqueDonnees] Échec de la connexion à MongoDB:", err);
    throw err;
  }
}

/**
 * Adds a moderation infraction for a user.
 * @param {string} userId       - Discord user ID of the target
 * @param {'warn'|'mute'|'ban'} type - Type of infraction
 * @param {string} reason       - Reason for the infraction
 * @param {string} moderatorId  - Discord user ID of the moderator
 */
async function addInfraction(userId, type, reason, moderatorId) {
  try {
    const database = await connectDB();
    await database.collection('infractions').insertOne({
      userId,
      type,
      reason,
      moderatorId,
      timestamp: new Date(),
      resolved: false,
    });
  } catch (err) {
    console.error(`[BanqueDonnees] Erreur lors de l'ajout d'une infraction (userId=${userId}, type=${type}):`, err);
    throw err;
  }
}

/**
 * Retrieves all infractions for a user, newest first.
 * @param {string} userId - Discord user ID
 * @returns {Promise<Array>}
 */
async function getInfractions(userId) {
  try {
    const database = await connectDB();
    return await database
      .collection('infractions')
      .find({ userId })
      .sort({ timestamp: -1 })
      .toArray();
  } catch (err) {
    console.error(`[BanqueDonnees] Erreur lors de la récupération des infractions (userId=${userId}):`, err);
    throw err;
  }
}

/**
 * Marks all active infractions of a given type as resolved for a user.
 * @param {string} userId           - Discord user ID
 * @param {'warn'|'mute'|'ban'} type - Type of infraction to resolve
 */
async function clearInfractions(userId, type) {
  try {
    const database = await connectDB();
    await database.collection('infractions').updateMany(
      { userId, type, resolved: false },
      { $set: { resolved: true } }
    );
  } catch (err) {
    console.error(`[BanqueDonnees] Erreur lors de la résolution des infractions (userId=${userId}, type=${type}):`, err);
    throw err;
  }
}

module.exports = { connectDB, addInfraction, getInfractions, clearInfractions };
