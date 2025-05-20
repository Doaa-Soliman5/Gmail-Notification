const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
require('dotenv').config();

console.log("🚀 Server is starting...");

const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_EMAIL,
    pass: process.env.GMAIL_PASSWORD
  }
});

console.log("✅ Cron job is being scheduled...");

cron.schedule('*/1 * * * *', async () => {
  console.log("🔄 Checking for meetings...");

  const now = Date.now();

  const usersSnap = await db.collection('users').get();
  console.log(`👥 Found ${usersSnap.size} users in Firebase:`);

  for (const userDoc of usersSnap.docs) {
    const user = userDoc.data();
    console.log(`🧑‍💻 ${user.name} - ${user.email}`);

    const scheduleRef = db.collection('users').doc(userDoc.id).collection('schedule');
    const scheduleSnap = await scheduleRef.get();

    if (scheduleSnap.empty) {
      console.log(`📭 No meetings scheduled for ${user.email}`);
      continue;
    }

    for (const meetingDoc of scheduleSnap.docs) {
      const meeting = meetingDoc.data();
      const timeUntilMeeting = meeting.meetingTime - now;

      console.log(`📅 Checking meeting: ${meeting.title} (${meeting.meetingTime})`);
      console.log("🧮 الآن:", now);
      console.log("⏳ باقي عليه بالمللي:", timeUntilMeeting);

      // يبعت قبل ميعاد الاجتماع بساعتين ± دقيقتين (يعني: من 1:58 لـ 2:02)
      const twoHours = 2 * 60 * 60 * 1000;
      const margin = 2 * 60 * 1000;

      if (
        !meeting.notified &&
        Math.abs(timeUntilMeeting - twoHours) <= margin

      ) {
        console.log(`⏰ Matched meeting: ${meeting.title} for ${user.email}`);

        const emailOptions = {
          from: process.env.GMAIL_EMAIL,
          to: user.email,
          subject: `⏰ Meeting in 2 hours - ${meeting.title}`,
          text: `Hello ${user.name},\n\nYou're invited to a meeting: "${meeting.title}".\n\n🕒 It starts in 2 hours.\n🔗 Join here: ${meeting.meetingLink}`
        };

        transporter.sendMail(emailOptions, async (err, info) => {
          if (err) {
            console.error(`❌ Failed to send to ${user.email}:`, err.message);
          } else {
            console.log(`✅ Email sent to ${user.email}`);
            await scheduleRef.doc(meetingDoc.id).update({ notified: true });
            console.log(`🔕 Marked as notified: ${meeting.title}`);
          }
        });
      }
    }
  }
});

console.log("✅ Cron job is running. Waiting for next interval...");
