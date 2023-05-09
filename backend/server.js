const express = require('express');
const bodyParser = require('body-parser')
const cors = require('cors');
const dotenv = require('dotenv');
const mockDb = require('./utils/mock-db');
const route = require('./route');

const Nylas = require('nylas');
const { WebhookTriggers } = require('nylas/lib/models/webhook');
const { openWebhookTunnel } = require('nylas/lib/services/tunnel');
const { Scope } = require('nylas/lib/models/connect');

dotenv.config();

const app = express();
app.use(express.json());

// Enable CORS
app.use(cors());

// The port the express app will run on
const port = 9000;

// Initialize the Nylas SDK using the client credentials
Nylas.config({
  clientId: process.env.NYLAS_CLIENT_ID,
  clientSecret: process.env.NYLAS_CLIENT_SECRET,
  apiServer: process.env.NYLAS_API_SERVER,
});

// Before we start our backend, we should register our frontend as a
// redirect URI to ensure the auth completes
// TODO: Remove this code
const CLIENT_URI =
  process.env.CLIENT_URI || `http://localhost:${process.env.PORT || 3000}`;
Nylas.application({
  redirectUris: [CLIENT_URI],
}).then((applicationDetails) => {
  console.log(
    'Application registered. Application Details: ',
    JSON.stringify(applicationDetails)
  );
});

// Start the Nylas webhook
openWebhookTunnel({
  // Handle when a new message is created (sent)
  onMessage: function handleEvent(delta) {
    switch (delta.type) {
      case WebhookTriggers.EventCreated:
        console.log(
          'Webhook trigger received, event created. Details: ',
          JSON.stringify(delta.objectData, undefined, 2)
        );
        break;
    }
  },
}).then((webhookDetails) => {
  console.log('Webhook tunnel registered. Webhook ID: ' + webhookDetails.id);
});

// '/nylas/generate-auth-url': This route builds the URL for
// authenticating users to your Nylas application via Hosted Authentication
// TODO: Remove this code
app.post('/nylas/generate-auth-url', async (req, res) => {
  const { body } = req;

  const authUrl = Nylas.urlForAuthentication({
    loginHint: body.email_address,
    redirectURI: (CLIENT_URI || '') + body.success_url,
    scopes: [Scope.Calendar],
  });

  return res.send(authUrl);
});

// '/nylas/exchange-mailbox-token': This route exchanges an authorization
// code for an access token
// and sends the details of the authenticated user to the client
// TODO: Remove this code
app.post('/nylas/exchange-mailbox-token', async (req, res) => {
  const body = req.body;

  const { accessToken, emailAddress } = await Nylas.exchangeCodeForToken(
    body.token
  );

  // Normally store the access token in the DB
  console.log('Access Token was generated for: ' + emailAddress);

  // TODO: Replace this with actual database
  const user = await mockDb.createOrUpdateUser(emailAddress, {
    accessToken,
    emailAddress,
  });

  // Return an authorization object to the user
  return res.json({
    id: user.id,
    emailAddress: user.emailAddress,
  });
});

// Middleware to check if the user is authenticated
// TODO: Switch to using a token-based authentication scheme
async function isAuthenticated(req, res, next) {
  if (!req.headers.authorization) {
    return res.status(401).json('Unauthorized');
  }

  // Query our mock db to retrieve the stored user access token
  const user = await mockDb.findUser(req.headers.authorization);
  const provider = await mockDb.findUser(req.body.providerId);

  if (!user) {
    return res.status(401).json('Unauthorized');
  }

  // Add the user to the response locals
  res.locals.user = user;
  res.locals.provider = provider;

  next();
}

// Add route for getting a calendar events
// app.get('/nylas/read-event', isAuthenticated, (req, res) => {
//   route.readEvent(req, res)
// });

app.get('/appointments/:id', isAuthenticated, (req, res) => {
  route.readEvent(req, res)
});

// app.get('/users/appointments', isAuthenticated, (req, res) => {
//   route.readEvent(req, res)
// });

// Add route for getting 20 latest calendar events
// app.get('/nylas/read-events/:userId', isAuthenticated, (req, res) => {
//   route.readEvents(req, res)
// });

app.get('/users/:userId/appointments', isAuthenticated, (req, res) => {
  route.readEvents(req, res)
});

// Add route for getting 20 latest calendar events
// app.get('/nylas/read-calendars', isAuthenticated, (req, res) =>
//   route.readCalendars(req, res)
// );

// Add route for creating calendar events
// app.post('/nylas/create-events', isAuthenticated, (req, res) =>
//   route.createEvents(req, res)
// );

// Add route for creating calendar events
app.post('/appointments', isAuthenticated, (req, res) =>
  route.createEvents(req, res)
);

app.post('/signup', (req, res) => 
  route.signup(req, res)
);

app.post('/providers/availability', isAuthenticated, (req, res) =>
  route.createEvents(req, res, { setAvailability: true })
);

app.get('/providers/:id/availability', isAuthenticated, (req, res) =>
  route.readEvents(req, res, { searchAvailability: true })
);

app.get('/providers/:id/appointments', isAuthenticated, (req, res) =>
  route.readEvents(req, res, { isProvider: true })
)

// Start listening on port 9000
app.listen(port, () => console.log('App listening on port ' + port));
