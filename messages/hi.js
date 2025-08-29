import axios from "axios";
import { DateTime } from "luxon";

const FromNumber = "715263275011455";

export const sendHiMessage = async (id, name) => {
  try {
    // First welcome message
    await axios.post(
      `https://graph.facebook.com/v22.0/${FromNumber}/messages`,
      {
        messaging_product: "whatsapp",
        to: id,
        type: "text",
        text: {
          body: `Hi ${name}, Welcome to Tazman.\nHow can we help you today?`,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Second follow-up message
    await axios.post(
      `https://graph.facebook.com/v22.0/${FromNumber}/messages`,
      {
        messaging_product: "whatsapp",
        to: id,
        type: "text",
        text: {
          body: `Please reply with *V* if you want to book a venue.`,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Hi messages sent successfully");
  } catch (err) {
    console.error(
      "❌ Error sending hi message:",
      err.response?.data || err.message
    );
  }
};


export const sendMessage = async (to, body) => {
  console.log('message body', body)
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v22.0/${FromNumber}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("Message sent:", response.data);
    return response.data;
  } catch (err) {
    console.error("Error sending message:", err.response?.data || err.message);
  }
};




export const sendInteractiveButtons = async (to, text, options) => {
  try {
    const buttons = options.map(opt => ({
      type: "reply",
      reply: { id: opt.id, title: opt.title },
    }));

    const response = await axios.post(
      `https://graph.facebook.com/v22.0/${FromNumber}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text },
          action: { buttons },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Button message sent:", response.data);
  } catch (err) {
    console.error("❌ Error sending buttons:", err.response?.data || err.message);
  }
}


export async function sendMainMenu(number, sendInteractiveButtons) {
  const message = "Hi Abdul Rafay Khan, Welcome to Tazman.\nHow can we help you today?";
  const buttons = [
    { id: "book_venue", title: "📍 Book a Venue" },
    { id: "cancel", title: "❌ Cancel" },
  ];

  return await sendInteractiveButtons(number, message, buttons);
}

// ✅ Generic Interactive List Sender
export async function sendInteractiveList(number, headerText, bodyText, items, sectionTitle = "Options", type = "list", idType = "index") {



  const response = await axios.post(
    `https://graph.facebook.com/v22.0/${FromNumber}/messages`,
    {
      messaging_product: "whatsapp",
      to: number,
      type: "interactive",
      interactive: {
        type: "list",
        header: {
          type: "text",
          text: headerText,
        },
        body: {
          text: bodyText,
        },
        action: {
          button: "Select",
          sections: [
            {
              title: "Popular Sports",
              rows: [
                { id: "sport_1", title: "Football" },
                { id: "sport_2", title: "Cricket" },
                { id: "sport_3", title: "Tennis" },
                { id: "sport_4", title: "Basketball" },
                { id: "sport_5", title: "Hockey" },
                { id: "sport_6", title: "Badminton" },
                { id: "sport_7", title: "Table Tennis" },
                { id: "sport_8", title: "Volleyball" },
                { id: "sport_9", title: "Rugby" },
                { id: "sport_10", title: "Baseball" },
              ],
            },
            {
              title: "More Sports",
              rows: [
                { id: "sport_11", title: "Squash" },

              ],
            },
          ],
        },
      },

    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );

}


export async function askForDate(number) {
  const today = DateTime.now().toFormat("dd-MM-yyyy");
  const tomorrow = DateTime.now().plus({ days: 1 }).toFormat("dd-MM-yyyy");

  return await sendInteractiveList(
    number,
    "Select a Date",
    "Please choose one of the options or type a custom date.",
    [
      { name: today },
      { name: tomorrow },
      { name: "Flexible" },
      { name: "Enter Date" },
    ],
    'Available Dates',
    'list',
    'value'
  );
}

export async function askForTime(number) {

  return await sendInteractiveList(
    number,
    "Select Time",
    "Please choose flexible to avoid time constraint or enter time manually.",
    [
      { name: "Flexible" },
      { name: "Enter Time" },
    ],
    'Available Time',
    'list',
    'value'
  );
}

export function generateTimesList(startHour = 0, endHour = 23) {
  const times = [];
  let dt = DateTime.fromObject({ hour: startHour, minute: 0 });
  const end = DateTime.fromObject({ hour: endHour, minute: 59 });

  while (dt <= end) {
    times.push(dt.toFormat("hh:mm a"));
    dt = dt.plus({ minutes: 30 });
  }
  return times;
}