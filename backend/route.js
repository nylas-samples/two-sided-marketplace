const { default: Event } = require('nylas/lib/models/event');
const Nylas = require('nylas');
const crypto = require('crypto');
const bcrypt = require("bcrypt");
const db = require("./db");
// TODO: Bring in dotenv

const { default: Calendar } = require("nylas/lib/models/calendar");
const StreamChat = require("stream-chat").StreamChat;

exports.readEvent = async (req, res) => {
  const user = res.locals.user;
  const eventId = req.params.id;
  let accessToken = null;

  if(user.user_type === 'patient') {
    db.get(
      "SELECT * FROM events \
      JOIN nylas_accounts ON events.nylas_account_id = nylas_accounts.user_id \
      where events.event_id = ?",
      [eventId], async (err, row) => {

        if (err) {
          res.status(500).json({ message: err });
          return;
        }

        accessToken = row.access_token;

        const events = await Nylas.with(accessToken).events.find(eventId);
        return res.json(events);
    })
  }
};

exports.readProviderEvents = async (req, res, options = {}) => {
  let events = []
  const user = res.locals.user;

  db.get(
    "SELECT * FROM nylas_accounts where user_id = ?",
    [req.params.id], async (err, row) => {

      if (err) {
        res.status(500).json({ message: err });
        return;
      }

      accessToken = row.access_token;

      if (user.user_type === 'provider') {
        events = await Nylas.with(accessToken).events.list();
      }

      if (user.user_type === 'patient' && options.searchAvailability) {
        const { startsAfter, endsBefore, limit } = req.query;
    
        const searchOptions = {
          // startsAfter,
          // endsBefore, 
          limit,
          busy: false,
        }
        events = await Nylas.with(accessToken).events.list(searchOptions)
      }
      return res.json(events);
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
      const { access_token, event_id } = data;
      const event = await Nylas.with(access_token)
        .events.find(event_id)
        .then((events) => events);

      return event;
    }));

    return res.json(events);
  })
};

exports.readCalendars = async (req, res) => {
  const user = res.locals.user;

  const calendars = await Nylas.with(user.accessToken).calendars.list()

  return res.json(calendars);
};

exports.createEvents = async (req, res, options = {}) => {
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

      const { access_token, calendar_id } = row;

      if (!access_token || !title || !startTime || !endTime) {
        return res.status(400).json({
          message:
            'Missing required fields: providerId, title, startTime or endTime',
        });
      }

      const nylas = Nylas.with(access_token);
      const event = new Event(nylas);

      event.calendarId = calendar_id;
      event.title = title;
      event.description = description;
      event.when.startTime = startTime;
      event.when.endTime = endTime;
      // NOTE: Setting free/busy to search for availability of provider
      event.busy = options.setAvailability ? false : true;
      
      const savedEvent = await event.save();

      if(!options.setAvailability) {
        console.log(user.user_id, calendar_id, savedEvent.id);
        const sql =
        "INSERT INTO events (user_id, calendar_id, event_id) VALUES (?,?,?)";
        const eventParams = [user.user_id, calendar_id, savedEvent.id];
        db.run(sql, eventParams, async function (err, result) {
          
          if (err) {
            res.status(500).json({ message: err });
            return;
          }
          res.json(savedEvent);
          return;
        });
      } else {
        res.json(savedEvent);
        return;
      }
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

      // TODO: Encrypt this accessToken
      const nylasSql = 
      "INSERT INTO nylas_accounts (user_id, account_id, access_token, calendar_id) VALUES (?,?,?,?)";
      const nylasParams = [
        userId, 
        account.id, 
        accessToken, 
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

// TODO: Clarify the use case, changed to readProvider for now
exports.readProvider = async (req, res) => {
  db.get(
    "SELECT * FROM nylas_accounts WHERE user_id = ?",
    [req.params.userId], async (err, row) => {

    Nylas.config({
      clientId: process.env.NYLAS_CLIENT_ID, 
      clientSecret: process.env.NYLAS_CLIENT_SECRET,
      apiServer: process.env.NYLAS_API_SERVER,
    })

    const account = await Nylas.accounts.find(row.account_id).then((user) => user);

    return res.json(account);
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

      return res.json(providers);
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

    return res.json(result);
  });
}

exports.deleteEvent = async (req, res) => {
  const user = res.locals.user;
  const eventId = req.params.eventId;
  let accessToken = user.access_token

  if(user.user_type === 'patient') {
    db.get(
      "SELECT * FROM events \
      JOIN nylas_accounts on users.user_id = nylas_accounts.user_id \
      where events.event_id = ?",
      [eventId], async (err, rows) => {

        if (err) {
          res.status(500).json({ message: err });
          return;
        }

        accessToken = rows.access_token;
      }
    )

    let nylas = Nylas.with(user.accessToken);
    
    const result = await nylas.events.delete([eventId]);

    db.run("DELETE FROM events WHERE event_id = ?", [eventId], function (err) {
      if (err) {
        res.status(500).json({ message: err });
        return;
      }
  
      return res.json(result);
    });
  }
}

exports.updateEvent = async (req, res) => {
  const user = res.locals.user;

  const {
    id,
    title, 
    description, 
    startTime, 
    endTime, 
    metadata,
  } = req.body;

  let accessToken = user.accessToken

  if(user.user_type === 'patient') {
    db.get(
      "SELECT * FROM events \
      JOIN nylas_accounts ON events.nylas_account_id = nylas_account_id.user_id \
      where events.event_id = ?",
      [id], async (err, row) => {

        if (err) {
          res.status(500).json({ message: err });
          return;
        }

        accessToken = row.access_token;
        let nylas = Nylas.with(user.accessToken);

        const event = nylas.events.find(id).then((event) => event);
      
        const updatedEvent = {
          ...event,
          title,
          description,
          startTime,
          endTime,
        }
      
        const result = nylas.events.save([updatedEvent]).then(result => result);
      
        return res.json(result);
    })
  }
}