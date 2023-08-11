# Two Sided Marketplace

![image2](https://github.com/nylas-samples/two-sided-marketplace/assets/553578/de1b9b3f-fafa-470d-9719-44c899477099)

**⚠️ Warning: This repo is not meant for use in production, only local testing, and stability is not fully guaranteed.**

This API backend is built for serving data to a frontend application (web/mobile) for the purpose of creating virtual calendars to share with individuals to book time slots.

The specific use case initially solves for health care scheduling where patients are able to:
1. Book a time slot to connect with a health care provider using [Nylas Calendar API](https://developer.nylas.com/docs/calendar/)
2. Have a live chat or video call  with a health care provider using [Stream's APIs](https://getstream.io/)

This application is based off of the [Read and Create Calendar Events Nylas Quickstart guide](https://github.com/nylas/use-cases/tree/main/packages/read-and-create-calendar-events/backend/node) in node.

## ⚡️ App Set up

View the `README.md` files in the `backend` directory for instructions on how to set up the server and client. These README files include set up instructions for each language.

Start the backend server, view below API endpoints to try out.

Once the servers are running you can make calls to the backend server at [http://localhost:9000](http://localhost:9000).

## Endpoints Usage (API Spec)

### All Users (accounts)
#### Create Patient or Provider account
1. Curl command:
```sh
# Example Curl
curl -X POST http://localhost:9000/signup \
   -H "Content-Type: application/json" \
   -d '{"username": "username", "password": "password", "userType": "patient"}'

# Response

{"feedToken":"feedToken","chatToken":"chatToken","username":"username","userId":"UUID"}%    
```

#### Login / Logout Users
1. Curl command to login user:
```sh
curl --location --request POST 'http://localhost:9000/auth/login' \
  --header 'Authorization: <<USER ID>>' \
```
2. Curl command to logout user:
```sh
curl --location --request POST 'http://localhost:9000/auth/logout' \
  --header 'Authorization: <<USER ID>>' \
```

#### Retrieve User Info
1. Curl command:
```sh
# Example
curl 'http://localhost:9000/users/:userId' \
  --header 'Authorization: <<USER ID>>'

# Response
{"id":"n21l62sd7zxbbyx4shskbnsr","account_id":"n21l62sd7zxbbyx4shskbnsr","billing_state":"paid","email":"0e23f48d-9396-41e6-a4e9-9a978ed7a5b3","namespace_id":"","provider":"nylas","sync_state":"running","authentication_type":"password","trial":false}%   
```

### Provide (i.e. Healthcare Provider)
#### View All Providers
1. (Optional) Create 5 providers by running `npm seed-provider`, ensure to drop the tables first.
2. Curl commands:
```sh
 curl 'http://localhost:9000/providers' \
   --header 'Authorization: <<USER ID>>'
```

#### Search for Provider Based on Specialty and Availability
1. Curl command:
```sh
curl 'http://localhost:9000/providers/availability/:specialty \
  --header 'Authorization: <<USER ID>>'
```

#### Provider can view upcoming appointments
1. Curl command:
```sh
curl 'http://localhost:9000/providers/:providerId/appointments' \
  --header 'Authorization: <<PROVIDER ID>>'
```

#### Provider can create add new availability
1. Curl command:
```sh
 curl --location --request POST 'http://localhost:9000/providers/availability \
   --header 'Authorization: <<PROVIDER ID>>' \
   --header 'Content-Type: application/json' \
   --data-raw '{
    "title":"event title",
    "startTime": 1598281200,
    "endTime": 1598284800,
    "providerId": "<<PROVIDER ID>>"
   }'
```

#### Get a List of Providers
1. Curl command:
```sh
# Example
curl 'http://localhost:9000/providers' \
  --header 'Authorization: <<USER ID>>'

# Response
[{"id":"360293ff-a4e9-45a7-9910-859897580e74","username":"provider_username","emailAddress":"360293ff-a4e9-45a7-9910-859897580e74"}]%  
```

#### Get a Specific Provider
1. Curl command:
```sh
# Example
curl 'http://localhost:9000/providers/:userId' \
  --header 'Authorization: <<USER ID>>'

# Response
{"id":"drx2wafdicl54qivbx7r9c0rt","account_id":"drx2wafdicl54qivbx7r9c0rt","billing_state":"paid","email":"360293ff-a4e9-45a7-9910-859897580e74","namespace_id":"","provider":"nylas","sync_state":"running","authentication_type":"password","trial":false}%  
```

#### Set Provider Availability
1. Curl command:
```sh
# Example Curl
curl --location --request POST 'http://localhost:9000/providers/availability' \
  --header 'Authorization: <<USER ID>>' \
  --header 'Content-Type: application/json' \
  --data-raw '{
   "title":"event title",
   "startTime": 1598281200,
   "endTime": 1598284800,
   "providerId": "<<PROVIDER ID>>"
  }'

# Response
{"id":"esiuzwl6vtup32any2vulxhxo","object":"event","account_id":"8t5q1lkc4gbf6awu7hlvo681o","calendar_id":"426g4nji71kuozm0khd0r5htc","ical_uid":"e72fe0ea23ff4d3ea60f19ecf84fed2e@nylas.com","message_id":"","title":"event title","description":"","owner":"Virtual Calendar <cdb2c42e-d31a-45e0-96d5-6b29000f48d2>","participants":[],"read_only":false,"location":"","when":{"start_time":1598281200,"end_time":1598284800,"object":"timespan"},"busy":true,"status":"confirmed","original_start_time":null,"reminders":null,"notifications":[],"metadata":{"providerId":"0ea16eed-d558-43b4-a109-bca7218cf08f","userId":"0ea16eed-d558-43b4-a109-bca7218cf08f"},"organizer_email":"cdb2c42e-d31a-45e0-96d5-6b29000f48d2","organizer_name":"Virtual Calendar","hide_participants":false,"visibility":"","customer_event_id":""}% 
```

#### Retrieve Provider Availability
1. Curl Command:
```sh
# Example
curl 'http://localhost:9000/providers/:providerId/availability \
  --header 'Authorization: <<USER ID>>'
```

### User (i.e. Healthcare Patient)
#### Query all the Users Appointments
1. (Optional) Seed database with user and appointments by running `npm seed-patient` (ensure providers exist by running `npm seed-provider` first)
2. Curl command:
```sh
curl 'http://localhost:9000/users/:userId/appointments' \
  --header 'Authorization: <<USER ID>>'
```

#### Create an Appointment
1. Curl Command:
```sh
curl --location --request POST 'http://localhost:9000/appointments' \
  --header 'Authorization: <<USER ID>>' \
  --header 'Content-Type: application/json' \
  --data-raw '{
   "title":"event title",
   "startTime": 1598281200,
   "endTime": 1598284800,
   "providerId": "<<PROVIDER ID>>"
  }'

# Response
{"id":"esiuzwl6vtup32any2vulxhxo","object":"event","account_id":"8t5q1lkc4gbf6awu7hlvo681o","calendar_id":"426g4nji71kuozm0khd0r5htc","ical_uid":"e72fe0ea23ff4d3ea60f19ecf84fed2e@nylas.com","message_id":"","title":"event title","description":"","owner":"Virtual Calendar <cdb2c42e-d31a-45e0-96d5-6b29000f48d2>","participants":[],"read_only":false,"location":"","when":{"start_time":1598281200,"end_time":1598284800,"object":"timespan"},"busy":true,"status":"confirmed","original_start_time":null,"reminders":null,"notifications":[],"metadata":{"providerId":"0ea16eed-d558-43b4-a109-bca7218cf08f","userId":"0ea16eed-d558-43b4-a109-bca7218cf08f"},"organizer_email":"cdb2c42e-d31a-45e0-96d5-6b29000f48d2","organizer_name":"Virtual Calendar","hide_participants":false,"visibility":"","customer_event_id":""}% 
```

#### Retrieve Appointment
1. Curl command:
```sh
# Example
curl 'http://localhost:9000/appointments/:id' \
  --header 'Authorization: <<USER ID>>'

# Response
{"id":"esiuzwl6vtup32any2vulxhxo","object":"event","account_id":"8t5q1lkc4gbf6awu7hlvo681o","calendar_id":"426g4nji71kuozm0khd0r5htc","ical_uid":"e72fe0ea23ff4d3ea60f19ecf84fed2e@nylas.com","message_id":"","title":"event title","description":"","owner":"Virtual Calendar <cdb2c42e-d31a-45e0-96d5-6b29000f48d2>","participants":[],"read_only":false,"location":"","when":{"start_time":1598281200,"end_time":1598284800,"object":"timespan"},"busy":true,"status":"confirmed","original_start_time":null,"reminders":null,"notifications":[],"metadata":{"providerId":"0ea16eed-d558-43b4-a109-bca7218cf08f","userId":"0ea16eed-d558-43b4-a109-bca7218cf08f"},"organizer_email":"cdb2c42e-d31a-45e0-96d5-6b29000f48d2","organizer_name":"Virtual Calendar","hide_participants":false,"visibility":"","customer_event_id":""}%  
```

#### Get all users appointments
1. Curl commands:
```sh
# Example
curl 'http://localhost:9000/users/:userId/appointments' \
  --header 'Authorization: <<USER ID>>'

# Response
[{"id":"esiuzwl6vtup32any2vulxhxo","object":"event","account_id":"8t5q1lkc4gbf6awu7hlvo681o","calendar_id":"426g4nji71kuozm0khd0r5htc","ical_uid":"e72fe0ea23ff4d3ea60f19ecf84fed2e@nylas.com","message_id":"","title":"event title","description":"","owner":"Virtual Calendar <cdb2c42e-d31a-45e0-96d5-6b29000f48d2>","participants":[],"read_only":false,"location":"","when":{"start_time":1598281200,"end_time":1598284800,"object":"timespan"},"busy":true,"status":"confirmed","original_start_time":null,"reminders":null,"notifications":[],"metadata":{"providerId":"0ea16eed-d558-43b4-a109-bca7218cf08f","userId":"0ea16eed-d558-43b4-a109-bca7218cf08f"},"organizer_email":"cdb2c42e-d31a-45e0-96d5-6b29000f48d2","organizer_name":"Virtual Calendar","hide_participants":false,"visibility":"","customer_event_id":""}]
```
