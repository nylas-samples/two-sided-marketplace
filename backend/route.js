import 'dotenv/config';
import Nylas from 'nylas';
import crypto from 'crypto';
import bcrypt from "bcrypt";
import db from "./db";
import { encrypt, decrypt } from './encrypt';

import { Calendar } from "nylas/lib/models/calendar";
import { StreamChat } from "stream-chat";

// Initialize the Nylas SDK using the client credentials
const NylasConfig = {
  apiKey: process.env.NYLAS_API_KEY,
  apiUri: process.env.NYLAS_API_REGION_URI,
};

const nylas = new Nylas(NylasConfig);

exports.readEvent = async (req, res) => {
  const user = res.locals.user;
  const eventId = req.params.id;
  let grantId = null;

  if(user.user_type === 'patient') {
    db.get(
      "SELECT * FROM events \
      JOIN nylas_accounts ON events.calendar_id = nylas_accounts.calendar_id \
      where events.event_id = ?",
      [eventId], async (err, row) => {

        if (err) {
          res.status(500).json({ message: err });
          return;
        }

        const grantId = decrypt(row.grant_id);

        const events = await nylas.events.find({
          identifier: grantId,
          event_id: eventId,
          query_params={
            "calendar_id": row.calendar_id
          }
        })
        return res.status(200).json(events.data);
    })
  }
};

exports.readProviderEvents = async (req, res, options = {}) => {
  let events = [];
  const user = res.locals.user;

  db.get(
    "SELECT * FROM nylas_accounts where user_id = ?",
    [req.params.id], async (err, row) => {

      if (err) {
        res.status(500).json({ message: err });
        return;
      }

      const grantId = decrypt(row.grant_id);

      if (user.user_type === 'provider') {
        events = await nylas.events.list({
          identifier: grantId,
          queryParams: {
              calendarId: row.calendar_id,
          }
        });
      }

      if (user.user_type === 'patient' && options.searchAvailability) {
        const { startsAfter, endsBefore, limit } = req.query;
    
        const searchOptions = {
          // startsAfter,
          // endsBefore, 
          limit,
          busy: false,
        }
        events = await nylas.events.list({
          identifier: grantId,
          queryParams: {
            calendarId: row.calendar_id,
            ...searchOptions
          }
        });
      }
      return res.status(200).json(events.data);
  })
}

exports.readProvidersAvailability = async (req, res, options = {}) => {
  let events = []
  const user = res.locals.user;

  db.all(
    "SELECT * FROM users \
    JOIN nylas_accounts ON users.user_id = nylas_accounts.user_id \
    where users.provider_specialty = ?",
    [req.params.specialty.toLowerCase()], async (err, rows) => {

      if (err) {
        res.status(500).json({ message: err });
        return;
      }
      
      if (user.user_type === 'patient' && options.searchAvailability) {
        const { startsAfter, endsBefore, limit } = req.query;
        
        const searchOptions = {
          // default is now
          starts_after: startsAfter || Math.floor(Date.now() - 2 * 24 * 60 * 60 * 1000/1000),
          // default is 5 days from now
          // ends_before: endsBefore || Math.floor((Date.now() + 5 * 24 * 60 * 60 * 1000)/1000), 
          limit: limit || 10,
          busy: false,
        }
        
        const allProvidersAvailability = await Promise.all(rows.map(async provider => {
          const grantId = decrypt(provider.grant_id);
          events = await nylas.events.list({
            identifier: grantId,
            queryParams: {
              calendarId: provider.calendar_id,
              ...searchOptions
            }
          });

          delete provider.grant_id;

          return ({
            ...provider,
            availability: events.data
          })
        }))
        
        return res.status(200).json(allProvidersAvailability);
      }
  })
}

exports.readEvents = async (req, res) => {
  const userId = req.params.userId;

  db.all(
    "SELECT * FROM events \
    JOIN nylas_accounts ON events.calendar_id = nylas_accounts.calendar_id \
    where events.user_id = ?",
    [userId], async (err, rows) => {

    if (err) {
      res.status(500).json({ message: err });
      return;
    }

    const events = await Promise.all(rows.map(async data => {
      const { grant_id, event_id } = data;
      const event = nylas.events.list({ identifier: decrypt(grant_id) })
        .events.find(event_id)
        .then((events) => events);

      return event;
    }));

    return res.status(200).json(events.data);
  })
};

exports.readCalendars = async (req, res) => {
  const user = res.locals.user;

  const calendars = await nylas.calendars.list({
    identifier: user.grant_id,
  });

  return res.status(200).json(calendars.data);
};

exports.createAvailability = async (req, res) => {
  const user = res.locals.user;
  
  const {
    title, 
    description, 
    startTime, 
    endTime,
    providerId,
    isBusy,
  } = req.body;

  db.get(
    "SELECT * FROM nylas_accounts where user_id = ?",
    [providerId], async (err, row) => {

      if (err) {
        res.status(500).json({ message: err });
        return;
      }

      const { grant_id, calendar_id } = row;

      if (!grant_id || !title || !startTime || !endTime) {
        return res.status(400).json({
          message:
            'Missing required fields: providerId, title, startTime or endTime',
        });
      }

      const event = await nylas.events.create({
        identifier: decrypt(grant_id),
        requestBody: {
          calendarId: calendar_id,
          title: title,
          description: description,
          when: {
            startTime,
            endTime            
          },
          busy: isBusy || false;
        },
        queryParams: {
          calendarId: calendar_id,
        },
      });
      
      res.status(200).json(event.data);
      return;
    }
  )
};


exports.modifyAvailability = async (req, res) => {
  const user = res.locals.user;
  
  const {
    title, 
    description, 
    startTime, 
    endTime,
    isBusy,
    id,
  } = req.body;

  console.log(user);

  db.get(
    "SELECT * FROM nylas_accounts \
    where nylas_accounts.user_id = ?",
    [user.user_id], async (err, row) => {

      if (err) {
        res.status(500).json({ message: err });
        return;
      }

      const grantId = row.grant_id;
      
      const event = await nylas.events.find({
        identifier: decrypt(grantId),
        event_id: eventId,
        query_params={
          "calendar_id": row.calendar_id
        }
      }).data

      event.title = title || event.title;
      event.description = description || event.description;
      event.when.startTime = startTime || event.when.startTime;
      event.when.endTime = endTime || event.when.endTime;
      event.busy = isBusy || event.busy;
      // TODO: Why is this required?
      event.visibility = null;
    
      await event.save();
      return res.status(200).json(event);
  })
};

exports.createAppointment = async (req, res) => {
  const user = res.locals.user;
  
  const {
    title, 
    description, 
    startTime, 
    endTime,
    providerId,
  } = req.body;

  db.get(
    "SELECT * FROM nylas_accounts where user_id = ?",
    [providerId], async (err, row) => {

      if (err) {
        res.status(500).json({ message: err });
        return;
      }

      const { grant_id, calendar_id } = row;

      if (!grant_id || !title || !startTime || !endTime) {
        return res.status(400).json({
          message:
            'Missing required fields: providerId, title, startTime or endTime',
        });
      }

      const event = await nylas.events.create({
        identifier: decrypt(grant_id),
        requestBody: {
          calendarId: calendar_id,
          title: title,
          description: description,
          when: {
            startTime,
            endTime            
          },
          busy: true;
        },
        queryParams: {
          calendarId: calendar_id,
        },
      });


      const savedEvent = event.data

      const sql =
      "INSERT INTO events (user_id, calendar_id, event_id) VALUES (?,?,?)";
      const eventParams = [user.user_id, calendar_id, savedEvent.id];
      db.run(sql, eventParams, async function (err, result) {
        
        if (err) {
          res.status(500).json({ message: err });
          return;
        }
        res.status(200).json(savedEvent);
        return;
      });
    }
  )
};

exports.login = async (req, res) => {
  try { 
    const { username, password } = req.body;
    const userId = username;

    db.get("SELECT * FROM users WHERE user_id = ?", [userId], async (err, row) => {
      const hashed_password = bcrypt.hashSync(password, row.salt);

      if (err) {
        res.status(500).json({ message: err });
        return;
      }
      if (hashed_password !== row.hashed_password) {
        res.status(401).json('Unauthorized');
        return;
      }
  
      // TODO: Refactor to a utility for re-use
      const chatClient = StreamChat.getInstance(process.env.STREAM_API_KEY, process.env.STREAM_API_SECRET);
      const chatToken = chatClient.createToken(userId);
  
      chatClient.upsertUser({
        id: userId,
        username: username,
      });

      return res.status(200).json({
        chatToken: chatToken,
        userId: row.user_id,
        publicId: row.public_id,
        userType: row.user_type,
      })
      
      // TODO: Collect tokens and return these too in the response
      return res.status(200).json(row);
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: err });
  }
};

exports.logout = async (req, res) => {
  try {
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: err });
  }
};

exports.signup = async (req, res) => {
  try {
    const { 
      username, 
      password, 
      userType, 
      providerSpecialty, 
      avatarUrl, 
      fullName 
    } = req.body;
    // so userId is username
    const userId = username;

    const publicId = crypto.randomUUID();
    const salt = bcrypt.genSaltSync(10);
    const hashed_password = bcrypt.hashSync(password, salt);

    // TODO: multiple db.runs are nested by callbacks, refactor to use async/await
    const sql =
    "INSERT INTO users ( \
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
        res.status(500).json({ userInsert: err });
        return;
      }

      const { code } = await Nylas.connect.authorize({
        name: "Virtual Calendar",
        emailAddress: publicId,
        clientId: process.env.NYLAS_CLIENT_ID,
      });

      const { accessToken } = await Nylas.exchangeCodeForToken(code);

      console.log('Access Token was generated for: ' + username);

      const nylasClient = Nylas.with(accessToken);
      const account = await nylasClient.account.get();

      const calendar = new Calendar(nylasClient, {
        name: "My New Calendar",
        description: "Description of my new calendar",
        location: "Location description",
        // TODO: Need to set timezone based on user's location
        timezone: "America/Los_Angeles",
        metadata: {
          test: "test",
        }
      })

      const savedCalendar = await calendar.save();

      const nylasSql = 
      "INSERT INTO nylas_accounts (user_id, account_id, access_token, calendar_id) VALUES (?,?,?,?)";
      const nylasParams = [
        userId, 
        account.id, 
        encrypt(accessToken), 
        savedCalendar.id
      ];
      db.run(nylasSql, nylasParams, async function (err, result) {

        if (err) {
          res.status(500).json({ nylasInsert: err });
          return;
        }

        const chatClient = StreamChat.getInstance(process.env.STREAM_API_KEY, process.env.STREAM_API_SECRET);
        const chatToken = chatClient.createToken(userId);

        chatClient.upsertUser({
          id: userId,
          username: username,
        });

        return res.status(200).json({
          chatToken: chatToken,
          userId: userId,
          publicId: publicId,
          userType: userType,
        })
        // });
      });
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: err });
  }
}

exports.readProvider = async (req, res) => {
  db.get(
    "SELECT * FROM users WHERE user_id = ?",
    [req.params.userId], async (err, row) => {

    if (err) {
      res.status(500).json({ message: err });
      return;
    }
    
    return res.status(200).json(row);
  })
}

exports.readProviders = async (req, res) => {
  db.all(
    "SELECT * FROM users where user_type = ?",
    ["provider"], async (err, rows = []) => {
      if (err) {
        res.status(500).json({ message: err });
        return;
      }

      const providers = rows.map(provider => ({
        id: provider.user_id,
        username: provider.user_id,
        fullName: provider.full_name,
        avatarUrl: provider.avatar_url,
        providerSpecialty: provider.provider_specialty
      }))

      return res.status(200).json(providers);
  })
}

// TODO: Restrict to admin
exports.deleteUser = (req, res) => {
  const userId = req.params.userId;

  Nylas.config({
    clientId: process.env.NYLAS_CLIENT_ID, 
    clientSecret: process.env.NYLAS_CLIENT_SECRET,
  });

  const result = Nylas.accounts.delete(`${userId}`).then(result => result);

  db.run("DELETE FROM users WHERE user_id = ?", [userId], function (err) {
    if (err) {
      res.status(500).json({ message: err });
      return;
    }

    return res.status(200).json(result);
  });
}

// TODO: Test this out
exports.deleteAppointment = async (req, res) => {
  const user = res.locals.user;
  const eventId = req.params.eventId;
  let grantId = user.grant_Id

  if(user.user_type === 'patient') {
    db.get(
      "SELECT * FROM events \
      JOIN nylas_accounts ON events.calendar_id = nylas_accounts.calendar_id \
      where events.event_id = ?",
      [eventId], async (err, rows) => {

        if (err) {
          res.status(500).json({ message: err });
          return;
        }

        grantId = rows.grant_id;
      }
    )
    
    const result = await nylas.events.destroy({
      identifier: decrypt(grantId),
      eventId,
      queryParams: {
        calendarId: user.calendar_id
      }
    });

    db.run("DELETE FROM events WHERE event_id = ?", [eventId], function (err) {
      if (err) {
        res.status(500).json({ message: err });
        return;
      }
  
      return res.status(200).json(result);
    });
  }
}

exports.updateAppointment = async (req, res) => {
  const user = res.locals.user;

  const {
    id,
    title, 
    description, 
    startTime, 
    endTime, 
  } = req.body;

  if(user.user_type === 'patient') {
    db.get(
      "SELECT * FROM events \
      JOIN nylas_accounts ON events.calendar_id = nylas_accounts.calendar_id \
      where events.event_id = ?",
      [id], async (err, row) => {

        if (err) {
          res.status(500).json({ message: err });
          return;
        }

        const grantId = row.grant_id;
        
        const event = await nylas.events.update({
          identifier: decrypt(grant_id),
          eventId: id,
          requestBody: {
            calendarId: calendar_id,
            title: title,
            description: description,
            when: {
              startTime,
              endTime            
            },
            busy: true,
            visibility = null
          },
          queryParams: {
            calendarId: calendar_id,
          },
        });
  
  
        const savedEvent = event.data
      
        return res.status(200).json(savedEvent);
    })
  }
}