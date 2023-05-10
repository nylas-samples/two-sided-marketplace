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

app.get('/appointments/:id', isAuthenticated, (req, res) => {
  route.readEvent(req, res)
});

app.get('/users/:userId/appointments', isAuthenticated, (req, res) => {
  route.readEvents(req, res)
});

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
