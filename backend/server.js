const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const route = require('./route');
const db = require('./db');

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

  db.get(
    "SELECT * FROM users WHERE user_id = ?", 
    [req.headers.authorization], async (err, row) => 
  {
    if (err) {
      res.status(500).json({ message: err });
      return;
    }

    if (!row) {
      return res.status(401).json('Unauthorized');
    }

    res.locals.user = row;
    next();
  });
}

app.get('/appointments/:id', isAuthenticated, (req, res) => {
  route.readEvent(req, res)
});

app.get('/users/:userId/appointments', isAuthenticated, (req, res) => {
  route.readEvents(req, res)
});

// app.get('/users/:userId', isAuthenticated, (req, res) => {
//   route.readUser(req, res)
// });

app.get('/providers/:userId', isAuthenticated, (req, res) => {
  route.readProvider(req, res)
});

app.get('/providers', isAuthenticated, (req, res) => {
  route.readProviders(req, res)
});

app.delete('/users/:userId', isAuthenticated, (req, res) => {
  route.readUser(req, res)
});

app.post('/appointments', isAuthenticated, (req, res) =>
  route.createAppointment(req, res)
);

app.delete('/appointments', isAuthenticated, (req, res) => 
  route.deleteAppointment(req, res)
)

app.patch('/appointments', isAuthenticated, (req, res) => 
  route.updateAppointment(req, res)
)

app.post('/signup', (req, res) => 
  route.signup(req, res)
);

app.post('/auth/login', (req, res) =>
  route.login(req, res)
)

app.post('/auth/logout', isAuthenticated, (req, res) =>
  route.logout(req, res)
)

app.post('/providers/availability', isAuthenticated, (req, res) =>
  route.createAvailability(req, res, { setAvailability: true })
);

app.patch('/providers/availability', isAuthenticated, (req, res) =>
  route.modifyAvailability(req, res)
);

app.get('/providers/:id/availability', isAuthenticated, (req, res) =>
  route.readProviderEvents(req, res, { searchAvailability: true })
);

app.get('/providers/availability/:specialty', isAuthenticated, (req, res) =>
  route.readProvidersAvailability(req, res, { searchAvailability: true })
);

app.get('/providers/:id/appointments', isAuthenticated, (req, res) =>
  route.readProviderEvents(req, res)
)

// Start listening on port 9000
app.listen(port, () => console.log('App listening on port ' + port));
