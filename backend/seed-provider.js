const sqlite3 = require('sqlite3');
const mkdirp = require("mkdirp");
const { faker } = require('@faker-js/faker');
const Nylas = require('nylas');
const crypto = require('crypto');
const bcrypt = require("bcrypt");
const dotenv = require('dotenv');
const { default: Calendar } = require("nylas/lib/models/calendar");
const { default: Event } = require('nylas/lib/models/event');
const { createTables } = require('./create-tables');
const { encrypt } = require('./encrypt');

dotenv.config();

mkdirp.sync("./var/db");

const db = new sqlite3.Database('./var/db/two-sided-marketplace.db');

const sampleProviderSpeciality = ["Cardiology", "Dermatology", "Pediatrics", "Obstetrics and Gynecology", "Orthopedics", "Neurology", "Psychiatry", "Anesthesiology", "Radiology", "Ophthalmology", "Urology", "Gastroenterology", "Endocrinology", "Nephrology", "Pulmonology", "Oncology", "Hematology", "Rheumatology", "Allergy", "Immunology", "Infectious Diseases"];

Nylas.config({
  clientId: process.env.NYLAS_CLIENT_ID,
  clientSecret: process.env.NYLAS_CLIENT_SECRET,
  apiServer: process.env.NYLAS_API_SERVER,
});

const createProviders = _ => ({
  username: faker.internet.userName(),
  avatarUrl: faker.image.avatar(),
  password: 'password1234',
  userType: 'provider',
  // TODO: Handling if name already contains Dr.
  fullName: `Dr. ${faker.person.fullName()}`,
  providerSpecialty: (() => {
    const randomIndex = Math.floor(Math.random() * sampleProviderSpeciality.length);

    return sampleProviderSpeciality[randomIndex].toLowerCase();
  })()
})

const fakeProviders = faker.helpers.multiple(createProviders, { count: 1 });

const updatedProviders = fakeProviders.map(async provider => {
  // create data object to store in different tables
  const salt = bcrypt.genSaltSync(10);

  let updatedProvider = {
    ...provider,
    userId: provider.username,
    publicId: crypto.randomUUID(),
    salt,
    hashed_password: bcrypt.hashSync(provider.password, salt),
  }

  const { code } = await Nylas.connect.authorize({
    name: "Virtual Calendar",
    emailAddress: updatedProvider.publicId,
    clientId: process.env.NYLAS_CLIENT_ID,
  });

  const { accessToken } = await Nylas.exchangeCodeForToken(code);

  const nylasClient = Nylas.with(accessToken);
  const { id: account_id } = await nylasClient.account.get();

  const calendar = new Calendar(nylasClient, {
    name: `${updatedProvider.fullName} Provider Calendar`,
    description: "health care provider calendar",
    location: "location details",
    // TODO: Need to set timezone based on user's location
    timezone: "America/Los_Angeles",
    metadata: {
      test: "test",
    }
  })

  const { id: calendar_id } = await calendar.save();

  updatedProvider = {
    ...updatedProvider,
    calendar_id,
    account_id,
    accessToken,
  }

  return updatedProvider
});

Promise.all(updatedProviders).then(providersToSave => {
  // TODO: Add functionality to drop tables before creating
  createTables(db)
  providersToSave.map(provider => {
    const {
      userId,
      hashed_password,
      publicId,
      userType,
      salt,
      providerSpecialty,
      fullName,
      avatarUrl,
      account_id,
      calendar_id,
      accessToken,
    } = provider
  
    const sql = "INSERT INTO users ( \
      user_id, \
      hashed_password, \
      public_id, \
      user_type, \
      salt, \
      provider_specialty, \
      full_name, \
      avatar_url) \
      VALUES (?,?,?,?,?,?,?,?) \
    ";
      
    const params = [
      userId, 
      hashed_password, 
      publicId, 
      userType, 
      salt,
      providerSpecialty,
      fullName,
      avatarUrl,
    ];
      
    db.run(sql, params, async function (err, result) {
      if (err) {
        console.log({ userInsert: err });
        return;
      }

      const nylasSql = 
      "INSERT INTO nylas_accounts ( \
        user_id, \
        account_id, \
        access_token, \
        calendar_id) \
        VALUES (?,?,?,?)";
      const nylasParams = [
        userId, 
        account_id, 
        encrypt(accessToken), 
        calendar_id
      ];
      db.run(nylasSql, nylasParams, async function (err, result) {

        if (err) {
          console.log({ nylasInsert: err });
          return;
        }

        console.log('~~~ Mock Provider and Nylas Account Created ~~~');

        console.log('Setting 24 Hour Availability For the Next 3 days:');

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 0, 0);

        // Create an array to store the timestamps
        const availability = [...Array(3)].map((_,i) => ({
          start: Math.floor((startOfToday.getTime() + i * 24 * 60 * 60 * 1000) / 1000),
          end: Math.floor(endOfToday.getTime() + i * 24 * 60 * 60 * 1000) / 1000
        }));

        console.log(availability);

        const nylasClient = Nylas.with(accessToken);

        Promise.all(
          availability.map(async (timeSlot) => {
            const event = new Event(nylasClient);
            event.calendarId = calendar_id;
            event.title = 'Available';
            event.description = 'description';
            event.when.startTime = timeSlot.start;
            event.when.endTime = timeSlot.end;
            event.busy = false;

            const availabilityEvent = await event.save();
          })
        ).then(result => 
          console.log('Availability Set for NextNext 3 days')
        )
      });
    });
  });
});