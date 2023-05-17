const sqlite3 = require('sqlite3');
const mkdirp = require("mkdirp");

mkdirp.sync("./var/db");

const db = new sqlite3.Database('./var/db/two-sided-marketplace.db')

  // create the database schema for the todos app
const createTable = () => {
    db.run(
        "CREATE TABLE IF NOT EXISTS users ( \
            user_id TEXT PRIMARY KEY NOT NULL, \
            hashed_password BLOB NOT NULL, \
            public_id TEXT NOT NULL, \
            user_type TEXT NOT NULL, \
            salt BLOB NOT NULL \
        )"
    )
}

db.serialize(function () {
    createTable();
});
  
module.exports = db;
