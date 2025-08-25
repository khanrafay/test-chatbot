import axios from "axios";

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