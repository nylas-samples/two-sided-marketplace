const { default: Event } = require('nylas/lib/models/event');
const Nylas = require('nylas');
const crypto = require('crypto');
const bcrypt = require("bcrypt");
const db = require("./db");

const { default: Calendar } = require("nylas/lib/models/calendar");
const StreamChat = require("stream-chat").StreamChat;

const mockDb = require('./utils/mock-db');

exports.readEvent = async (req, res) => {
  const user = res.locals.user;
  const eventId = req.params.id;
  let { accessToken } = user;

  // TODO: Place logic as part of a middleware instead of using everywhere

  if(user.userType === 'patient') {
    const { providerId } = user.events.find(event => event.id === eventId);
    const provider = await mockDb.findUser(providerId);
    accessToken = provider.accessToken;
  }

  const events = await Nylas.with(accessToken)
    .events.find(eventId)
    .then((events) => events);

  return res.json(events);
};

exports.readProviderEvents = async (req, res, options = {}) => {
  let events = []

  const user = res.locals.user;

  if (user.userType === 'provider') {
    events = await Nylas.with(accessToken)
      .events.find(eventId)
      .then((events) => events);
  } 
  
  if (user.userType === 'patient' && options.searchAvailability) {
    const { startsAfter, endsBefore, limit } = req.query;

    const searchOptions = {
      // startsAfter,
      // endsBefore, 
      limit,
      busy: false,
    }

    const provider = await mockDb.findUser(req.params.id);
    events = await Nylas.with(provider.accessToken)
      .events.list(searchOptions)
      .then((events) => events);
  }

  return res.json(events);
}

exports.readEvents = async (req, res) => {
  const userId = req.params.userId;
  let events = [];

  const { events: userEvents } = await mockDb.findUser(userId);

  const providerDetails = await Promise.all(userEvents.map(async event => {
    const provider = await mockDb.findUser(event.providerId);

    return {
      id: event.id,
      accessToken: provider.accessToken,
    }
  }));

  events = await Promise.all(providerDetails.map(async provider => {
    const { accessToken, id } = provider;
    const event = await Nylas.with(accessToken)
      .events.find(id)
      .then((events) => events);

    return event;
  }));

  return res.json(events);
};

// TODO: Consider removing since we store a calendar for each virtual account
exports.readCalendars = async (req, res) => {
  const user = res.locals.user;

  const calendars = await Nylas.with(user.accessToken)
    .calendars.list()
    .then((calendars) => calendars);

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

  const provider = await mockDb.findUser(providerId);
  const { calendarId } = provider;

  if (!provider || !title || !startTime || !endTime) {
    return res.status(400).json({
      message:
        'Missing required fields: calendarId, title, startTime or endTime',
    });
  }

  const nylas = Nylas.with(provider.accessToken);
  const event = new Event(nylas);

  event.calendarId = calendarId;
  event.title = title;
  event.description = description;
  event.when.startTime = startTime;
  event.when.endTime = endTime;
  // NOTE: Setting free/busy to search for availability of provider
  event.busy = options.setAvailability ? false : true;

  event.metadata = {
    providerId: provider.id,
    userId: user.id
  }
  
  const savedEvent = await event.save();

  await mockDb.updateUser(user.id, {
    events: [
      ...user.events, 
      {
        id: savedEvent.id,
        providerId: provider.id,
      }
    ]
  })

  return res.json(savedEvent);
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

// TODO: Refactor logic into utilitiy functions for re-use
exports.signup = async (req, res) => {
  try {
    const { username, password, userType } = req.body;
    const userId =username;

    const publicId = crypto.randomUUID();

    const salt = bcrypt.genSaltSync(10);
    const hashed_password = bcrypt.hashSync(password, salt);

    const sql =
    "INSERT INTO users (user_id, hashed_password, public_id, user_type, salt) VALUES (?,?,?,?,?)";
    const params = [userId, hashed_password, publicId, userType, salt];
    db.run(sql, params, async function (err, result) {
      if (err) {
        res.status(500).json({ message: err });
        return;
      }
      
      const { code } = await Nylas.connect.authorize({
        name: "Virtual Calendar",
        emailAddress: publicId,
        clientId: process.env.NYLAS_CLIENT_ID,
      });

      const { accessToken, account_id: accountId } = await Nylas.exchangeCodeForToken(code);

      console.log('Access Token was generated for: ' + username);

      const nylasClient = Nylas.with(accessToken);

      const calendar = new Calendar(nylasClient, {
        name: "My New Calendar",
        description: "Description of my new calendar",
        location: "Location description",
        timezone: "America/Los_Angeles",
        metadata: {
          test: "true",
        }
      })

      const savedCalendar = await calendar.save()

      const nylasAccount = await nylasClient.account.get();

      // TODO: Replace this with actual database
      const user = await mockDb.createOrUpdateUser(publicId, {
        accessToken,
        emailAddress: publicId,
        username,
        accountId: nylasAccount.id,
        calendarId: savedCalendar.id,
        userType: userType || 'patient',
        events: [],
      });

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
        userType: user.userType,
      })
    });

  } catch (err) {
      console.log(err);
      res.status(500).json({ message: err });
  }
}

exports.readUser = async (req, res) => {
  // TODO: Limit to the user to request this information
  const userId = req.params.userId;
  const user = res.locals.user;

  // console.log(userId);
  // if (user.id !== userId) {
    // return res.status(401).json('Unauthorized');
  // }

  Nylas.config({
    clientId: process.env.NYLAS_CLIENT_ID, 
    clientSecret: process.env.NYLAS_CLIENT_SECRET,
    apiServer: process.env.NYLAS_API_SERVER,
  })

  const account = await Nylas.accounts.find(user.accountId).then((user) => user);

  // TODO: Check what is returned, see if you need to augment with datastore
  return res.json(account);
}

exports.readProviders = async (req, res) => {
  const user = res.locals.user;
  
  const data = await mockDb.findProviders();

  // TODO: Consider storing and returning additional provider details
  const providers = data.map(provider => ({
    id: provider.id,
    username: provider.username,
    emailAddress: provider.emailAddress
  }))

  return res.json(providers);
}

// TODO: Restrict to admin
exports.deleteUser = (req, res) => {
  const userId = req.params.userId;

  Nylas.config({
    clientId: process.env.NYLAS_CLIENT_ID, 
    clientSecret: process.env.NYLAS_CLIENT_SECRET,
  });

  const result = Nylas.accounts.delete('{id}').then(result => result);

  return res.json(result);
}

exports.deleteEvent = async (req, res) => {
  const user = res.locals.user;
  const eventId = req.params.eventId;
  let accessToken = user.accessToken

  if(user.userType === 'patient') {
    const { providerId } = user.events.find(event => event.id === eventId);
    const provider = await mockDb.findUser(providerId);
    accessToken = provider.accessToken;
  }

  let nylas = Nylas.with(user.accessToken);

  const result = await nylas.events.delete([eventId]).then(result => result);

  const updatedEvents = user.events.filter(event => event.id !== eventId);

  await mockDb.updateUser(user.id, {
    events: updatedEvents
  })

  return res.json(result);
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

  if(user.userType === 'patient') {
    const { providerId } = user.events.find(event => event.id === eventId);
    const provider = await mockDb.findUser(providerId);
    accessToken = provider.accessToken;
  }

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
}