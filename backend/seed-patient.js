const sqlite3 = require('sqlite3');
const mkdirp = require("mkdirp");
const { faker } = require('@faker-js/faker');
const Nylas = require('nylas');
const crypto = require('crypto');
const bcrypt = require("bcrypt");
const dotenv = require('dotenv');
const { default: Calendar } = require("nylas/lib/models/calendar");
const { default: Event } = require('nylas/lib/models/event');
const { createTables } = require('./create-tables')
const { encrypt, decrypt } = require('./encrypt'); 

dotenv.config();

mkdirp.sync("./var/db");

const db = new sqlite3.Database('./var/db/two-sided-marketplace.db');

Nylas.config({
 clientId: process.env.NYLAS_CLIENT_ID,
 clientSecret: process.env.NYLAS_CLIENT_SECRET,
 apiServer: process.env.NYLAS_API_SERVER,
});

const createPatients = _ => ({
 username: faker.internet.userName(),
 avatarUrl: faker.image.avatar(),
 password: 'password1234',
 userType: 'patient',
 fullName: `${faker.person.fullName()}`,
})

const fakePatients = faker.helpers.multiple(createPatients, { count: 1 });

const updatedPatients = fakePatients.map(async patient => {
 // create data object to store in different tables
 const salt = bcrypt.genSaltSync(10);

 let updatedPatient = {
   ...patient,
   userId: patient.username,
   publicId: crypto.randomUUID(),
   salt,
   hashed_password: bcrypt.hashSync(patient.password, salt),
 }

 return updatedPatient
});


Promise.all(updatedPatients).then(patientsToSave => {
 // Note: Run seed-provider before running seed-patient
 // TODO: Add functionality to drop tables before creating
 // createTables(db)
  patientsToSave.map((patient, patientIndex) => {
    const {
      userId,
      hashed_password,
      publicId,
      userType,
      salt,
      fullName,
      avatarUrl,
    } = patient
  
    const sql = "INSERT INTO users ( \
      user_id, \
      hashed_password, \
      public_id, \
      user_type, \
      salt, \
      full_name, \
      avatar_url) \
      VALUES (?,?,?,?,?,?,?) \
    ";
      
    const params = [
      userId, 
      hashed_password, 
      publicId, 
      userType, 
      salt,
      fullName,
      avatarUrl,
    ];
      
    db.run(sql, params, async function (err, result) {
      if (err) {
        console.log({ userInsert: err });
        return;
      }

      console.log('~~~ Mock Patient Created ~~~');

      console.log('Setting Appointments for Patient For Each Provider');

      const startOfAppointment = new Date();
      startOfAppointment.setHours(patientIndex+10);

      const endOfAppointment = new Date();
      endOfAppointment.setHours(patientIndex+11);

      // Create an array to store the timestamps
      const availability = [...Array(10)].map((_,i) => ({
        start: Math.floor((startOfAppointment.getTime() + i * 24 * 60 * 60 * 1000) / 1000),
        end: Math.floor((endOfAppointment.getTime() + i * 24 * 60 * 60 * 1000) / 1000)
      }));

      db.all(
      "SELECT * FROM users \
      JOIN nylas_accounts ON users.user_id = nylas_accounts.user_id \
      where users.user_type = ?",
      ["provider"], async (err, rows = []) => {
        if (err) {
          console.log({ message: err });
          return;
        }

        rows.map(async (provider, providerIndex) => {
          const {
            access_token: accessToken,
            calendar_id: calendarId
          } = provider;

          const nylasClient = Nylas.with(decrypt(accessToken));
          const timeSlot = availability[providerIndex];
          const event = new Event(nylasClient);

          event.calendarId = calendarId;
          event.title = 'appointment title';
          event.description = 'appointment description';
          event.when.startTime = timeSlot.start;
          event.when.endTime = timeSlot.end;
          // TODO: Revisit this for setting appointments (set calendar to busy)
          event.busy = true;
          
          const appointmentEvent = await event.save();
          
          const sql =
            "INSERT INTO events (user_id, calendar_id, event_id) VALUES (?,?,?)";
            const eventParams = [userId, calendarId, appointmentEvent.id];
            db.run(sql, eventParams, async function (err, result) {
              
              if (err) {
                console.log({ message: err });
                return;
              }
          });
        });
      });
    });
  });
});