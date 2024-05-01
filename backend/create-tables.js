exports.createTables = (db) => {
 db.run(
     "CREATE TABLE IF NOT EXISTS users ( \
         user_id TEXT PRIMARY KEY NOT NULL, \
         hashed_password BLOB NOT NULL, \
         public_id TEXT NOT NULL, \
         user_type TEXT NOT NULL, \
         provider_specialty TEXT, \
         full_name TEXT, \
         avatar_url TEXT, \
         salt BLOB NOT NULL \
     )"
 )

 db.run(
     "CREATE TABLE IF NOT EXISTS events ( \
         user_id TEXT NOT NULL, \
         calendar_id TEXT NOT NULL, \
         event_id TEXT NOT NULL, \
         FOREIGN KEY (user_id) REFERENCES users(user_id) \
     )"
 )
 
 db.run(
     "CREATE TABLE IF NOT EXISTS nylas_accounts ( \
         user_id TEXT PRIMARY KEY NOT NULL, \
         account_id TEXT NOT NULL, \
         access_token TEXT NOT NULL, \
         grant_id TEXT NOT NULL, \
         calendar_id TEXT NOT NULL, \
         FOREIGN KEY (user_id) REFERENCES users(user_id) \
         FOREIGN KEY (calendar_id) REFERENCES calendars(calendar_id) \
     )"
 )
}