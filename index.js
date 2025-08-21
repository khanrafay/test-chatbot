//require('dotenv').config();

// const sendTemplateMessage = async () => {
//   try {
//     const response = await fetch(
//       'https://graph.facebook.com/v22.0/715263275011455/messages',
//       {
//         method: 'POST',
//         headers: {
//           'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
//           'Content-Type': 'application/json'
//         },
//         body: JSON.stringify({
//           messaging_product: 'whatsapp',
//           to: '923323604897',
//           type: 'template',
//           template: {
//             name: 'hello_world',
//             language: { code: 'en_US' }
//           }
//         })
//       }
//     );

//     const data = await response.json();
//     console.log(data);
//   } catch (err) {
//     console.error("Error sending message:", err);
//   }
// };

// const sendTextMessage = async () => {
//       try {
//     const response = await fetch(
//       'https://graph.facebook.com/v22.0/715263275011455/messages',
//       {
//         method: 'POST',
//         headers: {
//           'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
//           'Content-Type': 'application/json'
//         },
//         body: JSON.stringify({
//           messaging_product: 'whatsapp',
//           to: '923323604897',
//           type: 'text',
//           text: {
//             body: 'This is a text message'
//           }
//         })
//       }
//     );

//     const data = await response.json();
//     console.log(data);
//   } catch (err) {
//     console.error("Error sending message:", err);
//   }
// }

// //sendTemplateMessage();
// sendTextMessage();

const express = require("express");

const app = express();
app.use(express.json());
const PORT = 3000;

const VERIFY_TOKEN = "tazman-secret-token-321"; // must match Meta Dashboard

// ✅ Webhook verification endpoint
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified!");
    res.status(200).send(challenge); // MUST return challenge
  } else {
    res.sendStatus(403);
  }
});

// ✅ Incoming messages (POST)
app.post("/webhook", (req, res) => {
  console.log("📩 Incoming message:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200); // Always reply 200
});

app.post("/webhook", (req, res) => {
  console.log(JSON.stringify(req.body, null, 2))
  res.status(200).send('Webhook processed');
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// app.listen(3000, () => console.log("🚀 Server running on port 3000"));