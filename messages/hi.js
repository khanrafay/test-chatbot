export const sendHiMessage = async (client, message, name) => {
  await client.sendMessage(
    message.from,
    `Hi ${name}, Welcome to Tazman.\nHow can we help you today?`
  );

  await client.sendMessage(
    message.from,
    `Please reply with *V* if you want to book a venue.`
  );
};
