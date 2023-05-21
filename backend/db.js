const sqlite3 = require('sqlite3');
const mkdirp = require("mkdirp");

mkdirp.sync("./var/db");

const db = new sqlite3.Database('./var/db/two-sided-marketplace.db')

  // create the database schema for the todos app
const createTables = () => {
    db.run(
        "CREATE TABLE IF NOT EXISTS users ( \
            user_id TEXT PRIMARY KEY NOT NULL, \
            hashed_password BLOB NOT NULL, \
            public_id TEXT NOT NULL, \
            user_type TEXT NOT NULL, \
            salt BLOB NOT NULL \
        )"
    )

    db.run(
        "CREATE TABLE IF NOT EXISTS events ( \
            user_id TEXT NOT NULL, \
            calendar_id TEXT NOT NULL, \
            event_id TEXT NOT NULL, \
            FOREIGN KEY (user_id) REFERENCES users(user_id), \
            FOREIGN KEY (calendar_id) REFERENCES calendars(user_id) \
        )"
    )

    db.run(
        "CREATE TABLE IF NOT EXISTS calendars ( \
            user_id TEXT NOT NULL, \
            calendar_id TEXT NOT NULL, \
            FOREIGN KEY (user_id) REFERENCES users(user_id) \
        )"
    )
    
    // TODO: RUN THIS MIGRATION AGAIN

    db.run(
        "CREATE TABLE IF NOT EXISTS nylas_accounts ( \
            user_id TEXT PRIMARY KEY NOT NULL, \
            account_id TEXT NOT NULL, \
            access_token TEXT NOT NULL, \
            calendar_id TEXT NOT NULL, \
            FOREIGN KEY (user_id) REFERENCES users(user_id) \
            FOREIGN KEY (calendar_id) REFERENCES calendars(calendar_id) \
        )"
    )
}

db.serialize(function () {
    createTables();
});
  
module.exports = db;
