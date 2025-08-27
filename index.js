import dotenv from 'dotenv';
import axios from "axios";
import { DateTime } from "luxon";
import { connect, createPlayer, findPlayer, savePlayer, } from "./db.js";
import { sendHiMessage, sendMessage, sendInteractiveButtons, sendMainMenu, sendInteractiveList } from "./messages/hi.js";
import WS from "./websocket.js";
import express from 'express';


const app = express();
dotenv.config();
app.use(express.json());
const PORT = 3000;

const VERIFY_TOKEN = "tazman-secret-token-321"; // must match Meta Dashboard
const FromNumber = "715263275011455";


let cities = [];
let venues = [];
let sports = [];

const EmailQuestion = "Enter your email";
const CityQuestion = "Choose a city number from list";
const VenueQuestion = "Choose a venue number from list";
const SportQuestion = "Choose a sport number from list";
const DateQuestion = "Enter your preferred date";
const TimeQuestion = "Enter your preferred time";
const AvailabilityQuestion =
  "Please wait while we are checking available venues against these search terms";
const VenuesQuestion = "Select a venue number from list";
const FacilitiesQuestion = "Select a facility number from list";
const SlotsQuestion =
  "Select comma separated slot numbers, and keep in mind that you have to select numbers in a range. For example 1,2,3";
const EquipmentQuestion = "Select equipment numbers from list, or type *skip*";
const FriendsQuestion =
  "If you want your friends to play with you then you can enter a comma separated list of emails and we will send them game invites. Or type *skip*";
const ConfirmationQuestion =
  "Enter *confirm* to create booking or *C* to cancel this process";
// const ConfirmationQuestion2 = "Once confirmed we will create a new booking for you";
const ConfirmationQuestion3 =
  "A new user account has been created for you. An automated email will be sent to your account shortly";

let email = "";
let date = "";
let time = null;
let websocketMessage = null;

//✅ Webhook verification endpoint
app.get("/webhook", (req, res) => {
  console.log('heloooooooooooooo')
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

// sendTemplateMessage();


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

// sendTextMessage();



const API_URL = "https://api.tazman.pro";
// const API_URL = "http://tazman.localhost";
const WEB_URL = "https://tazman.pro";
const BOOKING_WEB_URL = "https://player.tazman.pro";


const axiosInstance = axios.create({ baseURL: API_URL });

const createSession = async () => {
  console.log("create session");
  const data = JSON.stringify({
    credentials: {
      type: "EMAIL_AND_PASSWORD",
      email: "admin@tazman.com",
      password: "tazmanadmin",
    },
    role: "ROLE_ADMIN",
  });

  const resp = await axiosInstance.post("/api/auth/login", data);

  const [cookie] = resp.headers["set-cookie"]; // getting cookie from request

  axiosInstance.defaults.headers.Cookie = cookie; // attaching cookie to axiosInstance for future requests
  return cookie; // return Promise<cookie> because func is async
};


let isGetActiveSessionRequest = false;
let requestQueue = [];

const callRequestsFromQueue = (cookie) => {
  requestQueue.forEach((sub) => sub(cookie));
};
const addRequestToQueue = (sub) => {
  requestQueue.push(sub);
};
const clearQueue = () => {
  requestQueue = [];
};

// registering axios interceptor which handle response's errors
axiosInstance.interceptors.response.use(null, (error) => {
  // console.error("error loggging here", error.message); //logging here

  const { response = {}, config: sourceConfig } = error;

  // checking if request failed cause Unauthorized
  if (response.status === 401) {
    // if this request is first we set isGetActiveSessionRequest flag to true and run createSession
    if (!isGetActiveSessionRequest) {
      isGetActiveSessionRequest = true;
      createSession()
        .then((cookie) => {
          // when createSession resolve with cookie value we run all request from queue with new cookie
          isGetActiveSessionRequest = false;
          callRequestsFromQueue(cookie);
          clearQueue(); // and clean queue
        })
        .catch((e) => {
          isGetActiveSessionRequest = false; // Very important!
          console.error("Create session error %s", e);
          clearQueue();
          //Sentry.captureException(e);
        });
    }

    // and while isGetActiveSessionRequest equal true we create and return new promise
    return new Promise((resolve) => {
      // we push new function to queue
      addRequestToQueue((cookie) => {
        // function takes one param 'cookie'
        console.log(
          "Retry with new session context %s request to %s",
          sourceConfig.method,
          sourceConfig.url
        );
        sourceConfig.headers.Cookie = cookie; // setting cookie to header
        resolve(axios(sourceConfig)); // and resolve promise with axios request by old config with cookie
        // we resolve exactly axios request - NOT axiosInstance's request because it could call recursion
      });
    });
  } else {
    // if error is not related with Unauthorized we just reject promise
    return Promise.reject(error);
  }
});

WS.on("error", console.error);


WS.on("open", function open() {
  console.log("websocket connected!");
  // WS.send('something');
});

WS.on("message", function message(data) {
  websocketMessage = data;
});

const request = async (url, options) => {
  return await axiosInstance.request({
    url: url,
    ...options,
    mode: "cors",
    withCredentials: true,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...options?.headers,
    },
  });
};



export const loadData = async () => {
  try {
    await createSession();
    // login admin
    const s = await request(`/api/tazman/search/sports/new?isActive=true`);
    sports = s.data.map((item) => {
      return {
        ...item,
        name: item.name.toLowerCase(),
      };
    });
    console.log("sports loaded", sports);
  } catch (e) {
    console.error("unable to load data", e);
    // Sentry.captureException(e)
  }
};

const loadCitiesList = async (id) => {
  const record = await findPlayer(id);
  const { sport } = record[0];
  console.log('spo', sport)
  try {
    const c = await request(
      `/api/tazman/search/venue/cities-keyword?sport=${sport.id}`
    );
    cities = c.data.cities.map((item) => {
      return {
        ...item,
        name: item.name.toLowerCase(),
      };
    });
  } catch (e) {
    console.log("cannot load city keywords");
    console.log(e);
    Sentry.captureException(e)
  }
};

const loadVenueKeywords = async (id) => {
  const record = await findPlayer(id);
  const { sport, city } = record[0];

  try {
    const url = `/api/tazman/venue/search/keyword?sportId[]=${sport?.id}&cities=0&city=${city?.id}`;
    const c = await request(url);
    venues = c.data.list.map((item) => {
      return {
        ...item,
        name: item.name.toLowerCase(),
      };
    });
  } catch (e) {
    console.log("cannot load venue keywords");
    console.log(e);
    Sentry.captureException(e)
  }
};

const loadCustomerInfo = async (phoneNumber) => {
  try {
    const data = await request(
      `/api/tazman/search/player/search-by-phone?phone=${phoneNumber}`
    );

    return {
      data: data.data.player,
    };
  } catch (e) {
    console.error("unable to get user info by phone number");
    //Sentry.captureException(e)
    console.log(e);
    // if (e.response.status === 404) {
    //   // try with email as well
    //   try {
    //     const data = await request(
    //       `/api/tazman/search/player/search-by-email?email=${phoneNumber}`
    //     );

    //     return {
    //       data: data.data.player,
    //     };
    //   } catch (ex) {
    //     Sentry.captureException(ex)
    //     console.error("unable to get user info by email either");
    //     // console.log(e);

    //     return {
    //       data: null,
    //       error: ex.response.data.errorMessage,
    //     };
    //   }
    // }

    // return {
    //   data: null,
    //   error: e.response.data.errorMessage,
    // };
  }
};

const searchVenues = async (id) => {
  const record = await findPlayer(id);
  const { date, time, q, sport } = record[0];

  const searchQuery = {
    q: q.name,
    sportId: [sport.id],
    date: date !== null ? date : undefined,
    timeFrom:
      time === null
        ? undefined
        : DateTime.fromFormat(time, "hh:mm a").toFormat("HH:mm:ss"),
    timeTo:
      time === null
        ? undefined
        : DateTime.fromFormat(time, "hh:mm a")
          .plus({ hours: 1 })
          .toFormat("HH:mm:ss"),
  };

  try {
    const data = await request(`/api/tazman/venue/search`, {
      params: searchQuery,
    });
    console.log('data for venues', data)
    return {
      data: data.data.venueList.map((venue) => ({
        id: venue.id,
        name: venue.name,
        totalPrice: venue.totalPrice,
      })),
    };
  } catch (e) {
    console.log("cant get venues data", e);
    Sentry.captureException(e)
    return {
      data: [],
    };
  }
};

const searchFacilities = async (id) => {
  const record = await findPlayer(id);
  const { venueId, sport, date, q, time } = record[0];

  const searchQuery = {
    q: q.name,
    sportId: [sport.id],
    date: date !== null ? date : undefined,
    timeFrom:
      time === null
        ? undefined
        : DateTime.fromFormat(time, "hh:mm a").toFormat("HH:mm:ss"),
    timeTo:
      time === null
        ? undefined
        : DateTime.fromFormat(time, "hh:mm a")
          .plus({ hours: 1 })
          .toFormat("HH:mm:ss"),
  };

  try {
    const data = await request(`/api/tazman/facility/list/venue/${venueId}`, {
      params: searchQuery,
    });

    return {
      data: data.data.facilityList.map((facility) => ({
        id: facility.id,
        name: facility.name,
      })),
    };
  } catch (e) {
    console.log("unable to find facilities", e);
    Sentry.captureException(e)

    return {
      data: [],
    };
  }
};

const searchGears = async (id) => {
  const record = await findPlayer(id);
  const { sport, venueId } = record[0];
  try {
    const data = await request(
      `/api/tazman/equipment-item/list/venue/${venueId}?sport=${sport.id}`
    );

    return {
      data: data.data.equipmentList,
    };
  } catch (e) {
    console.log("unable to load equipments", e);
    Sentry.captureException(e)
    return {
      data: [],
    };
  }
};

const searchTimeSlots = async (id) => {
  const record = await findPlayer(id);
  const { date, time, facilityId } = record[0];

  let params = {
    date: date !== null ? date : undefined,
    timeFrom:
      time === null
        ? undefined
        : DateTime.fromFormat(time, "hh:mm a").toFormat("HH:mm:ss"),
    timeTo:
      time === null
        ? undefined
        : DateTime.fromFormat(time, "hh:mm a")
          .plus({ hours: 1 })
          .toFormat("HH:mm:ss"),
    dateTimeFrom:
      date && time
        ? DateTime.fromFormat(`${date} ${time}`, "dd-MM-yyyy hh:mm a")
          .startOf("hour")
          .toISO()
        : undefined,
    dateTimeTo:
      date && time
        ? DateTime.fromFormat(`${date} ${time}`, "dd-MM-yyyy hh:mm a")
          .plus({ hour: 1 })
          .startOf("hour")
          .toISO()
        : undefined,
  };
  if (date && !time) {
    params = {
      ...params,
      dateTimeFrom: DateTime.fromFormat(`${date}`, "dd-MM-yyyy")
        .startOf("day")
        .toISO(),
      dateTimeTo: DateTime.fromFormat(`${date}`, "dd-MM-yyyy")
        .plus({ day: 1 })
        .startOf("day")
        .toISO(),
    };
  }

  try {
    const data = await request(
      `/api/admin/venue-booking/booking/${facilityId}/time-slot/list`,
      {
        params: params,
      }
    );

    return {
      data: data.data.timeSlotList,
    };
  } catch (e) {
    console.log("unable to find slots", e);
    Sentry.captureException(e)

    return {
      data: [],
    };
  }
};

const registerSlot = async (id) => {
  const player = await findPlayer(id);
  const { playerId, slots, facilityId } = player[0];

  try {
    const data = {
      playerId,
      facilityId,
      slots: slots.map((item) => ({
        startAt: item.calendarEntry.startAt,
        endAt: item.calendarEntry.endAt,
        repeatRules: [],
        repeatUntil: null,
      })),
    };
    await request("/api/player/timer/venue/create", {
      method: "POST",
      data: JSON.stringify(data),
    });
  } catch (e) {
    console.log("could not register slots", e);
    Sentry.captureException(e)
  }
};

const clearSlots = async (id) => {
  let record = await findPlayer(id);

  let { facilityId, playerId, slots } = record[0];

  if (slots && slots.length === 0) {
    return false;
  }

  try {
    const data = {
      playerId,
      facilityId,
    };

    await request("/api/player/timer/venue/delete", {
      method: "POST",
      data: JSON.stringify(data),
    });

    WS.send(
      JSON.stringify({
        data: {
          facilityId: facilityId,
          playerId: playerId,
        },
        type: "blockFacilitySlots",
      })
    );
  } catch (e) {
    console.log("could not un register slots", e);
    // Sentry.captureException(e)
  }
};

const createBookingPlayer = async (id) => {
  const player = await findPlayer(id);
  const { name, email, phone } = player[0];

  try {
    const newPassword = Math.floor(Math.random() * 100000000000);
    const data = await request(`/api/admin/player`, {
      method: "POST",
      data: JSON.stringify({
        firstName: name,
        lastName: name,
        email: email,
        password: newPassword.toString(),
        mobilePhoneNumber: {
          value: phone,
        },
      }),
    });

    await savePlayer(id, {
      playerId: data.data.player.id,
    });

    return {
      player: data.data.player,
      password: newPassword,
      email: email,
    };
  } catch (e) {
    console.log("cannot create player", e.response.data);
    Sentry.captureException(e)

    return null;
  }
};

const createBooking = async (id) => {
  const player = await findPlayer(id);
  const { slots, facilityId, playerId, sport, friends, equipments } =
    player[0];
  try {
    let calendarEntry = {
      startAt: slots[0].calendarEntry.startAt,
      endAt: slots[slots.length - 1].calendarEntry.endAt,
    };

    let invite = {};
    if (friends && friends.length > 0) {
      invite.emails = friends;
      invite.message = "Game invite request";
    }

    let eq = [];
    if (equipments) {
      equipments.forEach((item) => {
        eq.push({
          id: item.id,
          quantity: 1,
          price: item.priceList[0].price,
          bookedEntity: { id: item.id },
          bookedEntityType: "equipment",
          name: item.name,
        });
      });
    }

    const d = {
      calendarEntry: calendarEntry,
      facilityId: facilityId,
      paymentMethod: "Payment On Site",
      paymentMethodEntity: "visa",
      playerId: playerId,
      sportId: sport.id,
      invite: friends && friends.length > 0 ? invite : undefined,
      equipmentReservationItemList: eq,
      participantIdList: [],
      ignoreOverlaps: true
    };

    const data = await request(`/api/admin/venue-booking/booking/create`, {
      method: "POST",
      data: d,
    });

    WS.send(
      JSON.stringify({
        type: "newBooking",
        data: {
          message: `Someone just created a new booking for {sport}`,
          booking: data.data.reservation,
        },
      })
    );

    WS.send(
      JSON.stringify({
        type: "notify",
        from: playerId,
        data: {
          id: data.data.reservation.id,
          type: "venue-booking",
        },
      })
    );

    return {
      data: data.data.reservation,
    };
  } catch (e) {
    console.log("could not create booking");
    console.log(e);
    Sentry.captureException(e)

    return {
      data: null,
      error: "",
    };
  }
};

let dataLoaded = false; // global flag

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  if (!dataLoaded) {
    console.log("⏳ Loading data first time...");
    await loadData();   // your API call
    dataLoaded = true;  // prevent future calls
    console.log("✅ Data loaded");
  } else {
    console.log("⚡ Skipping loadData, already loaded");
  }


  const hi = [
    "hi",
    "hello",
    "aoa",
    "salam",
    "السلام علیکم",
    "سلام",
    "اسلام علیکم",
    "سلام علیکم"
  ];

  let question = "";
  let customer = null;

  const entry = req.body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;
  const message = value?.messages?.[0];
  const contact = value?.contacts?.[0];

  let body = message?.text?.body?.trim().toLowerCase() || "";
  customer = contact?.profile?.name || "Unknown";
  let id = message?.from || contact?.wa_id || "Unknown";

  let info = {
    number: contact?.wa_id || null,
    name: contact?.profile?.name || null,
  }

  if (message?.type === "interactive") {
    if (message?.interactive?.type === "button_reply") {
      body = message.interactive.button_reply.id;
    }
    if (message?.interactive?.type === "list_reply") {
      body = message.interactive.list_reply.id;
    }
  }

  console.log("📩 New Webhook:");
  console.log("customer:", customer);
  console.log("id:", id);
  console.log("question:", question);
  console.log('message', message)
  console.log("body:", body);

  let record = [{ result: [] }];
  try {
    const fetched = await findPlayer(id);
    console.log('fetched player', fetched)
    record = [{
      result: fetched // wrap fetched data into .result
    }];
  } catch (error) {
    console.error("Failed to fetch player:", error.message);
  }

  console.log('result', record[0]);
  var foundVenues = [],
    foundFacilities = [],
    foundSlots = [],
    foundGears = [],
    date = null,
    facilityId = null,
    friends = [],
    playerId = null,
    sport = null,
    city = null,
    q = null
    ;

  var firstMessage = false;

  if (record[0].result.length > 0) {
    var {
      foundVenues,
      foundFacilities,
      foundSlots,
      foundGears,
      facilityId: selectedFacility,
      date,
      playerId,
      friends,
      venueKeywords,
      sportsKeywords,
      cityKeywords,
      sport, city, q
    } = record[0].result[0];
  }
  if (record[0].result.length === 0) {
    firstMessage = true;

    if (info.number !== null) {
      await createPlayer(id, {
        phone: info.number,
        name: info.pushname,
        question: "Hi",
      });
    }
  } else {
    // get question from db
    if (record[0].result[0]?.question) {
      question = record[0].result[0].question;
    }
  }

  if (info.name === undefined) {
    // console.log("undefined detected, full info is", info);
  }
  if (hi.includes(body)) {
    customer = (await loadCustomerInfo(info.number)).data;

    await savePlayer(id, {
      question: "Hi", // reset question on first message
      playerId: customer?.id,
      email: customer?.email,
    });

    // await sendHiMessage(
    //   info.number,
    //   info.name
    // );

    await sendMainMenu(info.number, sendInteractiveButtons);

    return;
  } else if (body.toUpperCase() === "V" || body === "book_venue") {

    if (playerId === null) {
      question = EmailQuestion;
      await savePlayer(id, {
        question: EmailQuestion,
      });
      await sendMessage(message.from, EmailQuestion);
    } else {
      await sendSportsQuestion(message, body, id);
    }
  } else if (body.toUpperCase() === "C" || body === "cancel") {
    await reset(id);

    await sendMessage(
      message.from,
      "Sorry to see that.\nHow can we help you then?"
    );

    await sendMainMenu(message.from, sendInteractiveButtons);
  } else {

    if (question === EmailQuestion) { //|| question === record[0].result[0].question
      // email = body;
      if (!isValidEmail(body)) {
        await sendMessage(
          message.from,
          "Invalid email address, please try again"
        );
        return;
      }
      const customerData = await loadCustomerInfo(body.trim());
      if (customerData.error) {
        await sendMessage(message.from, customerData.error);
        return;
      }

      customer = customerData.data;

      await savePlayer(id, {
        email: message.body.trim(),
      });

      if (customer !== null) {
        await savePlayer(id, {
          playerId: customer.id,
        });
      } else {
        //create new player instead
        await sendMessage(message.from, "Creating new user account for you.");
        const d = await createBookingPlayer(id);
        customer = d;

        await sendMessage(
          message.from,
          `Account details:\nPlease visit *${WEB_URL}* or download *Tazman* app from Google Play or App Store.\nUsername: ${d.email}\n Password: ${d.password}`
        );
      }

      await sendSportsQuestion(message, body, id);
    } else if (question === VenueQuestion) {

      // find in cities/venues
      if (!venues[body.trim() - 1]) {
        await sendMessage(
          message.from,
          "Sorry this number is out of range, Select a venue number from list"
        );
      } else {
        // await sendSportsQuestion(message, body, id);
        await sendDateQuestion(message, body, id);
      }
    } else if (question === SportQuestion) {
      if (!sports[body.trim() - 1]) {
        await sendMessage(
          message.from,
          "Sorry this number is out of range, Select a sport number from list"
        );
      } else {
        console.log(
          'elseee'
        )
        await savePlayer(id, {
          sport: sports[body.trim() - 1],
        });
        await sendCityQuestion(message, id);
      }
    } else if (question === CityQuestion) {
      await sendVenueCityQuestion(message, id, body.trim());
    } else if (question === DateQuestion) {
      // parse date to match format
      if (body.trim().toLowerCase() === "flexible") {
        await sendVenuesMessage(body, message, id);

        let today = DateTime.now().toFormat("dd-MM-yyyy");
        if (parseInt(DateTime.now().toFormat("HH")) === 23) {
          today = DateTime.now().plus({ day: 1 }).toFormat("dd-MM-yyyy");
        }
        await savePlayer(id, {
          // question: TimeQuestion,
          date: today,
        });
      } else {
        const parseDate = DateTime.fromFormat(body, "dd-MM-yyyy");
        if (!parseDate.isValid) {
          await sendMessage(
            message.from,
            `Invalid date, please use *${DateTime.now().toFormat(
              "dd-MM-yyyy"
            )}* format, or type *flexible* to skip date constraint`
          );
        } else {
          if (parseDate.toFormat('dd-MM-yyyy') < DateTime.now().toFormat('dd-MM-yyyy')) {
            await sendMessage(
              message.from,
              `Past date not allowed, please use *${DateTime.now().toFormat(
                "dd-MM-yyyy"
              )}* format, or type *flexible* to skip date constraint`
            );
            return;
          }
          // question = TimeQuestion;
          await savePlayer(id, {
            question: TimeQuestion,
            date: parseDate.toFormat("dd-MM-yyyy"),
          });

          await sendMessage(message.from, TimeQuestion);
          await sendMessage(
            message.from,
            `Please use *${DateTime.now().toFormat(
              "hh:mm a"
            )}* format, or type *flexible* to skip time constraint`
          );

          // date = body;
        }
      }
    } else if (question === TimeQuestion) {
      await sendVenuesMessage(body, message, id);
    } else if (question === VenuesQuestion) {
      // get facilites from api
      if (!foundVenues[body.trim() - 1]) {
        await sendMessage(
          message.from,
          "Invalid venue number, Select a valid number from list"
        );
      } else {
        await sendFacilitiesQuestion(message, body, id);
      }
    } else if (question === FacilitiesQuestion) {
      if (!foundFacilities[body.trim() - 1]) {
        await sendMessage(
          message.from,
          "Invalid facility number, Select a valid number from list"
        );
      } else {
        let fac = foundFacilities[body.trim() - 1].id;

        await sendSlotsQuestion(message, fac, id);
      }
    } else if (question === SlotsQuestion) {
      if (body.trim().toLowerCase() === "next") {
        // search in next date
        let d = DateTime.fromFormat(date, "dd-MM-yyyy")
          .plus({ day: 1 })
          .toFormat("dd-MM-yyyy");

        await savePlayer(id, {
          date: d,
        });
        await sendSlotsQuestion(message, selectedFacility, id);
      } else if (body.trim().toLowerCase() === "previous") {
        // go back in date
        let d = DateTime.fromFormat(date, "dd-MM-yyyy")
          .minus({ day: 1 })
          .toFormat("dd-MM-yyyy");

        await savePlayer(id, {
          date: d,
        });
        await sendSlotsQuestion(message, selectedFacility, id);
      } else {
        let slotNumbers = body.trim().split(",").sort();
        let map = new Map();
        slotNumbers.forEach((item) => {
          map.set(item, item);
        });

        slotNumbers = Array.from(map.values());

        // validate
        let prev = null,
          hasError = false;

        slotNumbers.map((item) => {
          if (prev === null) {
            prev = item;
          } else {
            if (item - prev !== 1) {
              hasError = true;
            }

            prev = item;
          }
        });

        if (hasError) {
          await sendMessage(
            message.from,
            "Invalid slot numbers, Select slot numbers in order, you cannot skip slots from between"
          );
        } else {
          console.log('selected slots', foundSlots)
          let selectedSlots = record[0].result[0].foundSlots.filter((item) => {
            return slotNumbers.includes(item.slotNumber.toString());
          });

          if (selectedSlots.length !== slotNumbers.length) {
            await sendMessage(
              message.from,
              "Invalid slot numbers, please try again"
            );
            return false;
          }

          await savePlayer(id, {
            slots: selectedSlots,
          });

          // register slots on server
          await registerSlot(id);

          // send signal to gray out slots
          WS.send(
            JSON.stringify({
              data: {
                facilityId: selectedFacility,
                playerId: playerId,
                slots: selectedSlots,
              },
              type: "blockFacilitySlots",
            })
          );

          await sendFriendsQuestion(message, body, id);
        }
      }
    } else if (question === EquipmentQuestion) {
      if (body.trim().toLowerCase() === "skip") {
        await savePlayer(id, {
          question: ConfirmationQuestion,
          equipments: [],
        });


        // sendMessage(
        //   message.from,
        //   `You have selected following items.\nSport: ${sport.name}\\nCity: ${city.name}\\nVenue: ${q.name}\\nDate: ${date}\\nTime: ${!time ? 'Flexible' : time}\n${ConfirmationQuestion}`
        // );
        await sendMessage(
          message.from,
          ConfirmationQuestion
        )
      } else {
        // validate equipments
        let equipmentNumbers = body.trim().split(",").sort();
        let map = new Map();
        equipmentNumbers.forEach((item) => {
          map.set(item, item);
        });

        equipmentNumbers = Array.from(map.values());

        let selectedEquipments = foundGears.filter((item) => {
          return equipmentNumbers.includes(item.index.toString());
        });

        if (selectedEquipments.length !== equipmentNumbers.length) {
          await sendMessage(
            message.from,
            "Invalid gear numbers, please try again"
          );
          return false;
        }

        // question = ConfirmationQuestion;
        await savePlayer(id, {
          question: ConfirmationQuestion,
          equipments: selectedEquipments,
        });

        // send confirmation message
        await sendMessage(message.from, ConfirmationQuestion);
        // sendMessage(
        //   message.from,
        //   `You have selected following items.\nSport: ${sport.name}\\nCity: ${city.name}\\nVenue: ${q.name}\\nDate: ${date}\\nTime: ${!time ? 'Flexible' : time}\n${ConfirmationQuestion}`
        // );
      }
    } else if (question === FriendsQuestion) {
      if (body.trim().toLowerCase() !== "skip") {
        let hasError = false;
        let removedEmails = [];
        body.split(",").forEach((item) => {
          if (!isValidEmail(item.trim())) {
            hasError = true;
            removedEmails.push('❌ *' + item + '*');
          }
        });

        if (hasError) {
          await sendMessage(
            message.from,
            `One or more emails are invalid and are removed from list.\n${removedEmails.join(
              ", "
            )}`
          );
        }

        await savePlayer(id, {
          friends: body
            .split(",")
            .filter((item) => isValidEmail(item.trim()))
            .map((item) => item.trim()),
        });
      }

      await sendEquipmentQuestion(message, id);
    } else if (question === ConfirmationQuestion) {
      if (body.trim().toLowerCase() === "confirm") {
        await sendMessage(
          message.from,
          "Please wait creating booking for you"
        );

        const res = await findPlayer(id);
        const { playerId } = res[0];

        // create player
        let newCustomer = false;
        if (!playerId) {
          customer = await createBookingPlayer(id);
          newCustomer = true;
        }
        // create booking
        const r = await createBooking(id);

        if (r.error) {
          await sendMessage(message.from, r.error);

          return false;
        }

        if (r.data !== null) {
          await reset(id);

          let reservation = r.data;
          await sendMessage(
            message.from,
            `✔️ Booking created successfully, your booking# is *${reservation.bookingId}*. You will have to pay *SAR ${reservation.price / 100}* at the facility.`
          );

          await sendMessage(
            message.from,
            `Booking details:\n${BOOKING_WEB_URL}/en/whatsapp-booking-details/${reservation.id}\nFind Directions:\nhttps://www.google.com/maps/search/?api=1&query=${reservation?.venueLong?.gisPoint?.latitude},${reservation?.venueLong?.gisPoint?.longitude}`
          );


          if (newCustomer) {
            await sendMessage(message.from, ConfirmationQuestion3);

            await sendMessage(
              message.from,
              `Account details.\nPlease visit *${WEB_URL}* or download *Tazman* app from Google Play or App Store.\nUsername: ${customer.email}\n Password: ${customer.password}`
            );
          }
        }
      }
    } else {
      await sendMessage(
        message.from,
        "Sorry, I didn't understand. Please enter a valid option."
      );
      // console.log((await chat.getContact()).pushname, message.body);
    }
  }
});

const isValidEmail = (email) => {
  const regex = new RegExp(/^[\w-+_\.]+@([\w-]+\.)+[\w-]{2,4}$/);
  return regex.test(email);
};


const sendDateQuestion = async (message, body, id) => {
  await savePlayer(id, {
    question: DateQuestion,
    q: venues[body.trim() - 1],
  });

  //sendMessage(message.from, DateQuestion);
  await sendMessage(
    message.from,
    `${DateQuestion}\nPlease use *${DateTime.now().toFormat(
      "dd-MM-yyyy"
    )}* format, or type *flexible* to skip date constraint`
  );
}

const sendFriendsQuestion = async (message, body, id) => {
  await sendMessage(message.from, FriendsQuestion);

  await savePlayer(id, {
    question: FriendsQuestion,
  });
};

const sendSportsQuestion = async (message, body, id) => {
  await savePlayer(id, {
    question: SportQuestion,
    sportsKeywords: sports,
    // q: venues[body],
  });

  await sendMessage(
    message.from,
    "You can always type *C* or press *Cancel* (from the menu) to cancel the process."
  );
  await sendMessage(message.from, SportQuestion);

  await sendInteractiveList(
    message.from,
    "Choose a Sport",
    "Pick one sport from the list below:",
    sports,
    "Available Sports"
  );

};

const sendFacilitiesQuestion = async (message, body, id) => {
  let record = await findPlayer(id);

  // if (record[0].result[0].question) {
  let { foundVenues } = record[0];

  let selectedVenue = foundVenues[body.trim()].id;

  await savePlayer(id, {
    venueId: selectedVenue,
  });

  const facilities = await searchFacilities(id);

  let foundFacilities = facilities.data;

  await savePlayer(id, {
    question: FacilitiesQuestion,
    foundFacilities: foundFacilities,
  });

  if (foundFacilities.length === 1) {
    await sendMessage(
      message.from,
      `Found Facility ${foundFacilities[0].name}`
    );

    await sendSlotsQuestion(message, foundFacilities[0].id, id);
  } else {
    await sendMessage(message.from, FacilitiesQuestion);
    await sendMessage(
      message.from,
      facilities.data
        .map((item, index) => {
          return `${index + 1}. ${item.name}`;
        })
        .join("\n")
    );
  }

  // question = FacilitiesQuestion;
};

const sendEquipmentQuestion = async (message, id) => {
  let record = await findPlayer(id);

  // if (record[0].result[0].question) {
  let { sport, city, q, date, time, slots } = record[0];

  const equipments = await searchGears(id);
  if (equipments.data.length > 0) {
    let eq = equipments.data.map((item, index) => {
      item.index = index + 1;

      return item;
    });
    // question = EquipmentQuestion;
    await savePlayer(id, {
      question: EquipmentQuestion,
      foundGears: eq,
    });

    await sendMessage(message.from, EquipmentQuestion);
    await sendMessage(
      message.from,
      eq
        .map((item, index) => {
          return `${item.index}. ${item.name} for SAR *${item.priceList[0].price / 100
            }*`;
        })
        .join("\n")
    );
  } else {
    // question = ConfirmationQuestion;
    await savePlayer(id, {
      question: ConfirmationQuestion,
    });

    // send confirmation message
    // sendMessage(
    //   message.from,
    //   `You have selected following items.\nSport: ${sport.name}\nCity: ${city.name}\nVenue: ${q.name}\nDate: ${date}\nTime: ${!time ? 'Flexible' : time}\nSlots: ${slots.map(slot => `${slot.startAt}`)}`
    // );
    await sendMessage(
      message.from,
      ConfirmationQuestion
    );
  }
};

const sendSlotsQuestion = async (message, selectedFacility, id) => {
  let record = await findPlayer(id);

  // if (record[0].result[0].question) {
  let { date, time } = record[0];

  // question = SlotsQuestion;
  await savePlayer(id, {
    question: SlotsQuestion,
    facilityId: selectedFacility,
  });

  const slots = await searchTimeSlots(id);

  // await savePlayer(id, {
  //   foundSlots: slots.data,
  // });


  let previousSlot = null;
  let slotNumber = 1;

  let foundSlots = slots.data
    .filter((item) => item.isDisabled !== true && item.isBooked !== true)
    .map((item) => {
      if (previousSlot !== null) {
        slotNumber += DateTime.fromISO(item.calendarEntry.startAt)
          .diff(DateTime.fromISO(previousSlot))
          .as("hours");
      }

      previousSlot = item.calendarEntry.startAt;

      item.slotNumber = slotNumber;
      return item;
    });

  await savePlayer(id, {
    foundSlots: foundSlots,
  });

  if (foundSlots.length === 0) {
    await sendMessage(
      message.from,
      `Could not find slots in ${date} and ${time}, try again and select different date and time combinations.`
    );
  } else {
    await sendMessage(message.from, SlotsQuestion);
    await sendInteractiveList(
      message.from,
      "Select Time Slot",
      "Pick one slot from the list below:",
      foundSlots,
      "Available Slots",
      "slots"
    );
    // await sendMessage(
    //   message.from,
    //   foundSlots
    //     .map((item) => {
    //       return `${item.slotNumber}. ${DateTime.fromISO(
    //         item.calendarEntry.startAt
    //       ).toFormat("dd-MM-yyyy hh:mm a")} till ${DateTime.fromISO(
    //         item.calendarEntry.endAt
    //       ).toFormat("dd-MM-yyyy hh:mm a")} for *SAR ${item.price / 100}*`;
    //     })
    //     .join("\n")
    // );
  }

  await sendMessage(
    message.from,
    "Enter *next* or *previous* to move between dates"
  );
};

const sendCityQuestion = async (message, id) => {
  await loadCitiesList(id);

  await savePlayer(id, {
    question: CityQuestion,
    cityKeywords: cities,
    // email: message.body.trim(),
  });

  await sendMessage(message.from, CityQuestion);
  await sendInteractiveList(
    message.from,
    "Select City",
    "Pick one city from the list below:",
    cities,
    "Available Cities"
  );
  // await sendMessage(
  //   message.from,
  //   cities
  //     .map((item, index) => {
  //       return `${index + 1}. ${item.name}`;
  //     })
  //     .join("\n")
  // );
  if (cities.length === 1) {
    await sendMessage(message.from, `Only 1 city found. ✔️ *${cities[0].name}*`);

    await sendVenueCityQuestion(message, id, 1);
  }
};

const sendVenueCityQuestion = async (message, id, city) => {
  let record = await findPlayer(id);

  // if (record[0].result[0].question) {
  let { cityKeywords } = record[0];
  if (!cityKeywords[city - 1]) {
    await sendMessage(message.from, "Invalid city number, please try again");
    return false;
  }

  // question = VenueQuestion;
  await savePlayer(id, {
    question: VenueQuestion,
    venueKeywords: venues,
    city: cityKeywords[city - 1],
  });

  await loadVenueKeywords(id);

  await sendMessage(message.from, VenueQuestion);
  if (venues.length === 1) {
    await sendMessage(
      message.from,
      `Only 1 venue found. ✔️ *${venues[0].name}*`
    );
    await savePlayer(id, {
      q: venues[0]
    })
    console.log('before send date question', message, venues[0].name, id);
    await sendDateQuestion(message, venues[0].name, id);
  } else {
    await sendInteractiveList(
      message.from,
      "Select Venue",
      "Pick one venue from the list below:",
      venues,
      "Available Venues"
    );
  }
  // await sendMessage(
  //   message.from,
  //   venues
  //     .map((item, index) => {
  //       return `${index + 1}. ${item.name}`;
  //     })
  //     .join("\n")
  // );

};

const sendVenuesMessage = async (body, message, id) => {
  let record = await findPlayer(id);

  // if (record[0].result[0].question) {
  let { date } = record[0];

  if (body.trim().toLowerCase() === "flexible") {
    time = null;

    await savePlayer(id, {
      // question: TimeQuestion,
      time: time,
    });

    await _sendVenuesMessage(body, message, id);
  } else {
    // parse date to match format
    const parseDate = DateTime.fromFormat(body, "hh:mm a");
    if (!parseDate.isValid) {
      await sendMessage(
        message.from,
        `Invalid time, please use *${DateTime.now().toFormat(
          "hh:mm a"
        )}* format, or type *flexible* to skip time constraint`
      );
    } else {
      // validate if time and date are greater then today
      if (
        date === DateTime.now().toFormat("dd-MM-yyyy") &&
        parseDate < DateTime.now().toFormat("hh:mm a")
      ) {
        await sendMessage(
          message.from,
          `Past time not allowed, please use *${DateTime.now().toFormat(
            "hh:mm a"
          )}* format, or type *flexible* to skip time constraint`
        );

        return false;
      }

      time = body;

      await savePlayer(id, {
        time: body,
        question: TimeQuestion,
      });

      await _sendVenuesMessage(body, message, id);
    }
  }
};

const _sendVenuesMessage = async (body, message, id) => {
  let record = await findPlayer(id);

  // if (record[0].result[0].question) {
  let { sport, city, q, date, time } = record[0];

  await sendMessage(message.from, AvailabilityQuestion);

  const data = await searchVenues(id);
  console.log('searched venues', data)
  let foundVenues = data.data;

  await savePlayer(id, {
    foundVenues: foundVenues,
  });

  if (foundVenues.length === 0) {
    await sendMessage(
      message.from,
      "Sorry no venues available at the moment, you can try again with different search terms."
    );
    // sendMessage(
    //   message.from,
    //   `Sport: ${sport.name}\nCity: ${city.name}\nVenue: ${q.name}\nDate: ${date}\nTime: ${!time ? 'Flexible' : time}`
    // );
    await sendMessage(
      message.from,
      'Try again with sport selection'
    );
    await sendSportsQuestion(message, body, id);

    await savePlayer(id, {
      question: SportQuestion,
    });

  } else {
    if (foundVenues.length === 1) {
      // send facilities message
      await sendMessage(message.from, `Found ${foundVenues[0].name}`);
      await sendFacilitiesQuestion(message, "0", id);
    } else {
      // question = VenuesQuestion;
      await savePlayer(id, {
        question: VenuesQuestion,
      });

      await sendMessage(
        message.from,
        `Found ${foundVenues.length} venues, Select a venue number from list`
      );
      await sendMessage(
        message.from,
        foundVenues
          .map((item, index) => {
            return `${index + 1}. ${item.name}${item.totalPrice ? ` from SAR *${item.totalPrice / 100}*` : ""
              }`;
          })
          .join("\n")
      );
    }
  }
};

const reset = async (id) => {
  // clear slots
  await clearSlots(id);

  await savePlayer(id, {
    question: null,
    q: null,
    date: null,
    time: null,
    sport: null,
    venueId: null,
    facilityId: null,
    slots: [],
    equipments: [],
    friends: [],
    foundSlots: [],
    foundVenues: [],
    foundFacilities: [],
    foundGears: [],
    // playerId: null,
  });
};


app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});






