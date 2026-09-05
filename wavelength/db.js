// db.js — SQLite database layer for Wavelength
// Handles schema creation, seeding with randomized demo data, and query helpers.

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'wavelength.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL,
  bio TEXT,
  cover_color TEXT,
  is_bot INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  image TEXT,
  tag TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS likes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (follower_id, following_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  caption TEXT,
  category TEXT,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

// ---------- Seeding ----------
const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

if (userCount === 0) {
  console.log('Seeding database with demo data...');

  const insertUser = db.prepare(`INSERT INTO users (username, name, avatar, bio, cover_color, is_bot)
    VALUES (@username, @name, @avatar, @bio, @color, @bot)`);

  const baseUsers = [
    { username: 'aria.wave', name: 'Aria Chen', bio: 'Synth explorer • field recordings from everywhere', color: '#33C2A6' }, // 1
    { username: 'wavebot', name: 'Wavelength Bot', bio: 'I reply so you never message into silence 📡', color: '#9A8CFF', bot: 1 }, // 2
  ];

  const firstNames = ['Leo', 'Nova', 'Kai', 'Mira', 'Theo', 'Zara', 'Sam', 'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie', 'Charlie', 'Drew', 'Avery', 'Parker', 'Peyton', 'Skyler', 'Dakota', 'Rowan', 'Hayden', 'Reese', 'Kendall', 'Logan', 'Quinn', 'Harper', 'Eden', 'Ariel'];
  const lastNames = ['Marsh', 'Patel', 'Okafor', 'Sato', 'Bianchi', 'Ibrahim', 'Whitfield', 'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson'];
  const bios = ['Just vibing', 'Coffee addict', 'Loves the outdoors', 'Code is poetry', 'Art enthusiast', 'Music producer', 'Always exploring', 'Book worm', 'Foodie at heart', 'Dog parent'];
  const colors = ['#33C2A6', '#FF5D73', '#FFC857', '#7C9EFF', '#FF9F6B', '#9A8CFF'];

  let allUsers = [...baseUsers];
  for (let i = 0; i < 200; i++) {
    const fn = rand(firstNames);
    const ln = rand(lastNames);
    allUsers.push({
      username: `${fn.toLowerCase()}.${ln.toLowerCase()}${randInt(10,9999)}`,
      name: `${fn} ${ln}`,
      bio: rand(bios),
      color: rand(colors),
      bot: 0
    });
  }

  const userIds = allUsers.map((u, i) => {
    const info = insertUser.run({
      username: u.username,
      name: u.name,
      avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${u.username}`,
      bio: u.bio,
      color: u.color,
      bot: u.bot || 0,
    });
    return info.lastInsertRowid;
  });

  const CURRENT_USER_ID = userIds[0];
  const BOT_ID = userIds[1];

  const postTexts = [
    'Caught the last light over the reservoir tonight. Worth the cold hands.',
    'New mix is up — recorded most of it on a train, felt right.',
    'Three failed loaves before this one finally proofed properly.',
    'Nobody tells you how loud a city gets at 5am until you\'re the only one awake in it.',
    'Finally fixed the buzz in the amp. It was the cable the whole time.',
    'Sketchbook page from the studio today. Slow week, good week.',
    'Small win: the bug was a missing semicolon. Big win: I found it before deploy.',
    'Every rooftop in this city has a different version of the same view.',
  ];
  const tags = ['music', 'photo', 'food', 'life', 'code', 'art'];

  const insertPost = db.prepare(`INSERT INTO posts (user_id, content, image, tag, created_at) VALUES (?, ?, ?, ?, ?)`);
  const postIds = [];
  for (let i = 0; i < 100; i++) {
    const uid = rand(userIds.slice(2)); // skip current user and bot
    const hasImage = Math.random() < 0.55;
    const info = insertPost.run(
      uid,
      rand(postTexts),
      hasImage ? `https://picsum.photos/seed/wave${i}/800/600` : null,
      rand(tags),
      daysAgo(randInt(0, 14))
    );
    postIds.push(info.lastInsertRowid);
  }

  const commentTexts = ['This is so good 👏', 'Okay but the light in this', 'Need this on repeat', 'Wait where is this??'];
  const insertComment = db.prepare(`INSERT INTO comments (post_id, user_id, content, created_at) VALUES (?, ?, ?, ?)`);
  postIds.forEach((pid) => {
    const n = randInt(0, 3);
    for (let i = 0; i < n; i++) {
      insertComment.run(pid, rand(userIds), rand(commentTexts), daysAgo(randInt(0, 13)));
    }
  });

  const insertLike = db.prepare(`INSERT OR IGNORE INTO likes (user_id, post_id) VALUES (?, ?)`);
  postIds.forEach((pid) => {
    const n = randInt(0, 10);
    for (let i = 0; i < n; i++) insertLike.run(rand(userIds), pid);
  });

  const insertFollow = db.prepare(`INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)`);
  for (let i = 0; i < 500; i++) {
    const a = rand(userIds);
    const b = rand(userIds);
    if (a !== b) insertFollow.run(a, b);
  }
  // Make sure current user follows some and is followed
  for (let i = 0; i < 20; i++) {
    insertFollow.run(CURRENT_USER_ID, rand(userIds));
    insertFollow.run(rand(userIds), CURRENT_USER_ID);
  }
  // Everyone follows the bot
  userIds.forEach(uid => insertFollow.run(uid, BOT_ID));

  // --- Messages ---
  const insertMsg = db.prepare(`INSERT INTO messages (sender_id, receiver_id, content, created_at) VALUES (?, ?, ?, ?)`);
  const msgTexts = ["Hey!", "How's it going?", "Did you see that post?", "Let's catch up soon.", "I completely agree.", "That's awesome!"];
  // Seed conversations for current user with everyone else
  for (let i = 1; i < userIds.length; i++) {
    const otherId = userIds[i];
    if (Math.random() > 0.5) {
      insertMsg.run(CURRENT_USER_ID, otherId, rand(msgTexts), daysAgo(randInt(0, 14)));
    } else {
      insertMsg.run(otherId, CURRENT_USER_ID, rand(msgTexts), daysAgo(randInt(0, 14)));
    }
  }

  // --- Reels ---
  const insertReel = db.prepare(`INSERT INTO reels (user_id, url, caption, category, likes, comments, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);

  const CATEGORY_REELS = {
    'Motivation': [
      { url: 'https://www.youtube.com/embed/7sxpKhIbr0E', caption: 'Discipline will take you places motivation can’t. 🧠⚡ #motivation #discipline #mindset' },
      { url: 'https://www.youtube.com/embed/wnHW6o8WMas', caption: 'Never give up on your dreams. The grind never stops. 🚀 #nevergiveup #hustle' },
      { url: 'https://www.youtube.com/embed/ZXsQAXx_ao0', caption: 'Stay hard. David Goggins 4AM mentality every single day. 💪 #goggins #stayhard' },
      { url: 'https://www.youtube.com/embed/L_LUpnjgPso', caption: 'Work in silence, let your success make the noise. 🤫✨ #focus #grind' },
      { url: 'https://www.youtube.com/embed/hT_nvWreIhg', caption: 'The 1% rule: improve 1% each day and watch the compound effect. 📈 #growth #success' },
      { url: 'https://www.youtube.com/embed/mgmVOuLgFB0', caption: 'Mindset is everything when the pressure is at its peak. ⚡🔥 #unstoppable #focus' },
      { url: 'https://www.youtube.com/embed/L3wKzyIN1yk', caption: 'Overcome self-doubt and conquer your biggest fears today. 🦁👑 #courage #win' }
    ],
    'Comedy': [
      { url: 'https://www.youtube.com/embed/FzG4uDgje3M', caption: 'When you tell your mom you’ll be home in 5 minutes vs 5 hours later 😂💀 #comedy #relatable #funny' },
      { url: 'https://www.youtube.com/embed/kXYiU_JCYtU', caption: 'Every introvert at a loud party trying to sneak out the back door 😭🚪 #introvertproblems #standup' },
      { url: 'https://www.youtube.com/embed/M7lc1UVf-VE', caption: 'Office meetings that definitely could have been a 2-sentence email 🤣📉 #workhumor #corporate' },
      { url: 'https://www.youtube.com/embed/dQw4w9WgXcQ', caption: 'The legendary internet anthem that never gets old 🕺🎵 #memes #viral #vibes' },
      { url: 'https://www.youtube.com/embed/9bZkp7q19f0', caption: 'When the barber completely ignores your photo reference 💈✂️😭 #comedyvideos #viralreels' },
      { url: 'https://www.youtube.com/embed/fJ9rUzIMcZQ', caption: 'Relatable daily struggles that everyone pretends don’t happen 🤦‍♂️😹 #funnyreels #humor' },
      { url: 'https://www.youtube.com/embed/J---aiyznGQ', caption: 'Cat logic explained in 10 hilarious seconds 🐱😹 #catmemes #pets' },
      { url: 'https://www.youtube.com/embed/5qap5aO4i9A', caption: 'Expectations vs reality when ordering food late at night 🍕🍔😂 #comedyvideos' }
    ],
    'Serious': [
      { url: 'https://www.youtube.com/embed/OPf0YbXqDm0', caption: 'A brutal truth nobody tells you about growing up. 💭🕊️ #deepthoughts #lifelessons' },
      { url: 'https://www.youtube.com/embed/2Vv-BfVoq4g', caption: 'Time is the only currency you can never earn back. Spend it wisely. ⏳ #wisdom #stoicism' },
      { url: 'https://www.youtube.com/embed/CevxZvSJLk8', caption: 'Protect your peace at all costs. Boundaries are essential. 🛡️🌱 #mindfulness #mentalhealth' },
      { url: 'https://www.youtube.com/embed/09R8_2nJtjg', caption: 'Deep psychological insights into why people act the way they do. 🌌🧠 #perspective' },
      { url: 'https://www.youtube.com/embed/1G4isv_Fylg', caption: 'True peace comes when you finally let go of controlling everything. 🕊️✨ #wisdom' }
    ],
    'Gym Freak': [
      { url: 'https://www.youtube.com/embed/W3q8Od5qJio', caption: 'Heavy PR Friday! 220kg deadlift clean lockout. What’s your PR? 🏋️‍♂️💥 #gymfreak #deadlift #gains' },
      { url: 'https://www.youtube.com/embed/ml6cT4AZdqI', caption: 'Proper shoulder mechanics for maximum chest activation 🚨💪 #fitness #benchpress' },
      { url: 'https://www.youtube.com/embed/2MoGxae-zyo', caption: 'Calisthenics masterclass: Perfect form progressions from zero to planche 🦾⚡ #calisthenics #beastmode' },
      { url: 'https://www.youtube.com/embed/gC_L9qAHVJ8', caption: 'Shoulder boulder pump workout that burns like fire 🔥💪 #gymmotivation #workout' },
      { url: 'https://www.youtube.com/embed/UBMk30rjy0o', caption: 'The ultimate arm hypertrophy circuit to break plateaus 💥🦾 #biceps #bodybuilding' },
      { url: 'https://www.youtube.com/embed/e-ORhEE9VVg', caption: 'Heavy squat depth form check and mobility routine 🦵🏋️ #squat #strength' }
    ],
    'Yoga': [
      { url: 'https://www.youtube.com/embed/sTANio_2E0Q', caption: '15-minute gentle morning flow to release tight hips and awaken your spine 🧘‍♀️🌅 #yoga #flexibility' },
      { url: 'https://www.youtube.com/embed/v7AYKMP6rOE', caption: 'Instant lower back decompression routine. Save this for after work! 🌿🧘‍♂️ #backpainrelief #yoga' },
      { url: 'https://www.youtube.com/embed/4pKly2JojMw', caption: 'Deep somatic breathing: 4-7-8 relaxation technique for nervous system reset 🍃✨ #breathwork #peace' },
      { url: 'https://www.youtube.com/embed/k2qgadSvNyU', caption: 'Spinal flexibility and posture alignment routine for desk workers 🪷🌿 #posture #yoga' },
      { url: 'https://www.youtube.com/embed/7wtfhZwyrcc', caption: 'Gentle restorative bedtime yoga for deep unbroken sleep 🌙🧘 #rest #sleephacks' }
    ],
    'Exercise': [
      { url: 'https://www.youtube.com/embed/ml6cT4AZdqI', caption: 'Full body fat melt: 20-min zero equipment apartment cardio session 👟🔥 #homeworkout #hiit #sweat' },
      { url: 'https://www.youtube.com/embed/gC_L9qAHVJ8', caption: 'Core torching circuit: 4 movements, 45 seconds each. Can you finish 3 rounds? 💦⚡ #absworkout' },
      { url: 'https://www.youtube.com/embed/2MoGxae-zyo', caption: 'Pushup mastery: standard vs diamond vs archer form check 🚫✅ #calisthenics #pushups' },
      { url: 'https://www.youtube.com/embed/UBMk30rjy0o', caption: 'Explosive athletic conditioning & speed plyometrics drills ⚡🏃‍♂️ #athletic #cardio' },
      { url: 'https://www.youtube.com/embed/e-ORhEE9VVg', caption: 'Functional joint mobility drills for hips and ankles 🦵🦶 #mobility #functionalfitness' }
    ],
    'Competitive Exam': [
      { url: 'https://www.youtube.com/embed/kJQP7kiw5Fk', caption: 'Silent 3 AM study session. The pain of discipline or the pain of regret — you choose. 📚🌙 #upsc #neet #aspirant' },
      { url: 'https://www.youtube.com/embed/3JZ_D3ELwOQ', caption: 'Active recall & spaced repetition: How top 1% rankers actually study 🧠📝 #examtips #studymotivation' },
      { url: 'https://www.youtube.com/embed/RgKAFK5djSk', caption: 'When exam pressure is high, remember why you started. Keep pushing! 🎯🔥 #competitiveexams #aspirants' },
      { url: 'https://www.youtube.com/embed/uelHwf8o7_U', caption: 'Rapid formula memory hacks for fast calculation under pressure ⚡📐 #toppertricks #maths' },
      { url: 'https://www.youtube.com/embed/oHg5SJYRHA0', caption: 'Exam hall strategy: How to eliminate negative marks in MCQs 🎯📋 #examstrategies #competitive' }
    ],
    'Job': [
      { url: 'https://www.youtube.com/embed/fRh_vgS2dFE', caption: 'The exact answer template for “Tell me about yourself” that interviewers love 💼🚀 #interviewtips #careeradvice' },
      { url: 'https://www.youtube.com/embed/V-_O7nl0Ii0', caption: 'How to counter-offer your tech salary without risking the job offer 💰🤝 #salarynegotiation #techjobs' },
      { url: 'https://www.youtube.com/embed/YQHsXMglC9A', caption: 'Top 3 resume mistakes that get 90% of candidates rejected by ATS scanners 📄✨ #resume #hiring' },
      { url: 'https://www.youtube.com/embed/lTRiuFIWV54', caption: 'Staff Software Engineer daily routine: Architecture design, code reviews, deploy 👨‍💻💻 #codinglife #developer' }
    ]
  };

  const reelCategories = Object.keys(CATEGORY_REELS);

  for (let i = 0; i < 500; i++) {
    const cat = rand(reelCategories);
    const item = rand(CATEGORY_REELS[cat]);
    const uid = rand(userIds);
    const likes = randInt(1500, 480000);
    const comments = randInt(25, 9800);
    insertReel.run(uid, item.url, item.caption, cat, likes, comments, daysAgo(randInt(0, 30)));
  }

  console.log(`Seeded ${userIds.length} users, ${postIds.length} posts, ${userIds.length - 1} conversations, 500 reels.`);
}

module.exports = db;
