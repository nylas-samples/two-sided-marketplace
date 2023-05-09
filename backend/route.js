const { default: Event } = require('nylas/lib/models/event');
const Nylas = require('nylas');
const crypto = require('crypto');
const { default: Calendar } = require("nylas/lib/models/calendar");
const { connect } = require("getstream");
const StreamChat = require("stream-chat").StreamChat;

const mockDb = require('./utils/mock-db');

exports.readEvent = async (req, res) => {
  const user = res.locals.user;
  const eventId = req.params.id;

  const events = await Nylas.with(user.accessToken)
    .events.find(eventId)
    .then((events) => events);

  return res.json(events);
};

// TODO: Reconsider refactoring to simplify the logic and be modular
exports.readEvents = async (req, res, options = {}) => {
  const userId = req.params.userId;
  const user = res.locals.user;

  // const { calendarId, startsAfter, endsBefore, limit } = req.query;
  let searchOptions = {};

  // TODO: Revisit logic
  if (options.searchAvailability) {
    searchOptions.busy = false;
  } else {
    searchOptions.metadata_pair = options.isProvider ? { 'providerId' : userId } : { 'userId' : userId }
  }

  const events = await Nylas.with(user.accessToken)
    .events.list(searchOptions)
    .then((events) => events);

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

// We need to separate or clarify this based on type of user
exports.createEvents = async (req, res, options = {}) => {
  const user = res.locals.user;
  const provider = res.locals.provider;

  const {
    // calendarId,
    title, 
    description, 
    startTime, 
    endTime, 
    participants,
    // NOTE: ProviderId is required to retrieve the provider details
    // providerId,
  } = req.body;

  // TODO: Do we need to consider storing events for the patient (in its own calendar)?

  const { calendarId } = provider;

  if (!provider || !title || !startTime || !endTime) {
    return res.status(400).json({
      message:
        'Missing required fields: calendarId, title, startTime or endTime',
    });
  }

  // TODO: Duplicate logic, refactor
  const nylas = Nylas.with(provider.accessToken);
  const event = new Event(nylas);

  event.calendarId = calendarId;
  event.title = title;
  event.description = description;
  event.when.startTime = startTime;
  event.when.endTime = endTime;
  // NOTE: Setting free/busy to search for availability of provider
  event.busy = options.setAvailability ? false : true;

  // TODO: Storing as metadata for quick retrieve of information
  event.metadata = {
    providerId: provider.id,
    userId: user.id
  }

  // TODO: Re-consider if we need pariticipants
  if (participants) {
    event.participants = participants
      .split(/\s*,\s*/)
      .map((email) => ({ email }));
  }

  // console.log(103, event);

  await event.save();

  // NOTE: Save calendar event in user/patient virtual calendar as well
  if(!options.setAvailability) {
    const nylasUserInstance = Nylas.with(user.accessToken);
    let event2 = new Event(nylasUserInstance);
    event2.calendarId = user.calendarId;
    event2.title = title;
    event2.description = description;
    event2.when.startTime = startTime;
    event2.when.endTime = endTime;

    event2.metadata = {
      providerId: provider.id,
      userId: user.id
    }
    await event2.save();
  }
  return res.json(event);
};

// TODO: Refactor logic into utilitiy functions for re-use
exports.signup = async (req, res) => {
  try {
    const { username, password, userType } = req.body;
    const userId =username;

    const publicId = crypto.randomUUID();

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

    // TODO: Replace this with actual database
    const user = await mockDb.createOrUpdateUser(publicId, {
      accessToken,
      emailAddress: publicId,
      username,
      accountId,
      calendarId: savedCalendar.id,
      userType: userType || 'patient',
    });

    const feedClient = connect(
      process.env.STREAM_API_KEY, 
      process.env.STREAM_API_SECRET, 
      process.env.STREAM_APP_ID, 
      // TODO: Should we consume location as well?
      { location: "eu-west", }
    );

    const chatClient = StreamChat.getInstance(process.env.STREAM_API_KEY, process.env.STREAM_API_SECRET);

    const feedToken = feedClient.createUserToken(userId);
    const chatToken = chatClient.createToken(userId);

    chatClient.upsertUser({
      id: userId,
      username: username,
    });

    return res.status(200).json({
      feedToken,
      chatToken,
      username,
      userId: publicId,
    })

  } catch (err) {
      console.log(err);
      res.status(500).json({ message: err });
  }
}