# Wavelength — Mini Social Media App

A full-stack social platform (Instagram/Facebook-inspired, but with its own
visual identity) built with **Express.js + SQLite** on the backend and
**vanilla HTML/CSS/JS** on the frontend.

## Features
- **User profiles** — avatar, bio, cover, follower/following/post counts
- **Posts** — text + optional photo, tagged by category, feed + explore grid
- **Comments** — inline comment threads per post
- **Likes** — toggleable, live counts
- **Follow system** — follow/unfollow, "who to follow" suggestions
- **Direct messages** — slide-out chat drawer, polls for new messages
- **Auto-reply chatbot** — message "Wavelength Bot" and it writes back a few
  seconds later with a randomized reply (with a typing indicator), simulating
  a real auto-responder

The database is seeded automatically on first run with realistic random
users, posts, comments, likes, and follow relationships.

## Design
The visual identity ("Wavelength") uses a dark ink palette with teal/coral/
amber/violet accents, a serif display face (Fraunces) paired with a
geometric sans (Manrope), and a waveform motif to reinforce the "tuning in
to people" concept — built specifically for this app rather than a generic
Instagram clone skin.

## Getting started

```bash
npm install
npm start
```

Then open **http://localhost:3000**.

A demo user ("Aria Chen") is already "logged in" — there's no auth screen,
since this is a demo/portfolio build. Every API call acts as that user.

## Project structure

```
wavelength/
├── server.js          Express app + REST API + bot auto-reply logic
├── db.js               SQLite schema + seed data generator
├── package.json
├── wavelength.db        (created on first run)
└── public/
    ├── index.html
    ├── css/style.css
    └── js/app.js
```

## API overview

| Method | Route                              | Description                     |
|--------|-------------------------------------|----------------------------------|
| GET    | /api/me                             | Current demo user                |
| GET    | /api/users                          | All users                        |
| GET    | /api/users/suggested                | Suggested follows                |
| GET    | /api/users/:id                      | User profile                     |
| GET    | /api/users/:id/posts                | A user's posts                   |
| POST   | /api/users/:id/follow               | Follow a user                    |
| POST   | /api/users/:id/unfollow             | Unfollow a user                  |
| GET    | /api/posts                          | Feed (all posts)                 |
| POST   | /api/posts                          | Create a post                    |
| POST   | /api/posts/:id/like                 | Toggle like                      |
| GET    | /api/posts/:id/comments             | List comments                    |
| POST   | /api/posts/:id/comments             | Add a comment                    |
| GET    | /api/conversations                  | DM inbox                         |
| GET    | /api/messages/:userId                | Thread with a user               |
| POST   | /api/messages/:userId                | Send a DM (triggers bot auto-reply if applicable) |

## Notes on swapping in a different stack
This uses `better-sqlite3` for a real embedded SQL database with zero
external setup. Swapping to Postgres/MySQL or a Django backend would mean
re-implementing `db.js`'s schema and `server.js`'s routes in your framework
of choice — the frontend talks to a plain REST API and doesn't care what's
behind it.
