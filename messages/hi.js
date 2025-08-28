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
  console.log('venues check', items)

  let sec = [];
  if (type === "slots") {
    const chunkArray = (arr, size) =>
      arr.reduce((acc, _, i) => (i % size ? acc : [...acc, arr.slice(i, i + size)]), []);

    const chunkedItems = chunkArray(items, 10);

    sec = chunkedItems.map((chunk, idx) => ({
      title: `${sectionTitle} ${idx + 1}`, // e.g. Available Slots 1, Available Slots 2
      rows: chunk.map((item) => ({
        id: `slot_${item.slotNumber}`, // must be unique
        title: DateTime.fromISO(item.calendarEntry.startAt).toFormat("hh:mm a"), // must be <= 24 chars
        description: `Till ${DateTime.fromISO(item.calendarEntry.endAt).toFormat("hh:mm a")} • SAR ${item.price / 100}`
      }))
    }));
  }

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
        footer: {
          text: "Choose one option",
        },
        action: {
          button: "Select",
          sections: type === "list" ? [
            {
              rows: items.map((item, index) => ({
                id: idType === "index" ? `${index + 1}` : item.name,
                title: item.name,
              })),
            },
          ] : sec,
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