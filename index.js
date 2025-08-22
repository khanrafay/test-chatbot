import dotenv from 'dotenv';
import axios from "axios";
import { DateTime } from "luxon";
import { connect, createPlayer, findPlayer, savePlayer, } from "./db.js";
import { sendHiMessage } from "./messages/hi.js";
import WS from "./websocket.js";
import express from 'express';


const app = express();
dotenv.config();
app.use(express.json());
const PORT = 3000;

const VERIFY_TOKEN = "tazman-secret-token-321"; // must match Meta Dashboard




const API_URL = "https://api.tazman.pro";
// const API_URL = "http://tazman.localhost";
const WEB_URL = "https://tazman.pro";


const axiosInstance = axios.create({ baseURL: API_URL });

const createSession = async () => {
  console.log("create session");
  const data = JSON.stringify({
    credentials: {
      type: "EMAIL_AND_PASSWORD",
      email: "admin@tazman.com",
      password: "password",
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
          Sentry.captureException(e);
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
  } catch (e) {
    console.error("unable to load data", e);
    Sentry.captureException(e)
  }
};

export const loadCitiesList = async (id) => {
  const record = await findPlayer(id);
  const { sport } = record[0].result[0];

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

export const loadVenueKeywords = async (id) => {
  const record = await findPlayer(id);
  const { sport, city } = record[0].result[0];

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

export const loadCustomerInfo = async (phoneNumber) => {
  try {
    const data = await request(
      `/api/tazman/search/player/search-by-phone?phone=${phoneNumber}`
    );

    return {
      data: data.data.player,
    };
  } catch (e) {
    console.error("unable to get user info by phone number");
    Sentry.captureException(e)
    console.log(e);
    if (e.response.status === 404) {
      // try with email as well
      try {
        const data = await request(
          `/api/tazman/search/player/search-by-email?email=${phoneNumber}`
        );

        return {
          data: data.data.player,
        };
      } catch (ex) {
        Sentry.captureException(ex)
        console.error("unable to get user info by email either");
        // console.log(e);

        return {
          data: null,
          error: ex.response.data.errorMessage,
        };
      }
    }

    return {
      data: null,
      error: e.response.data.errorMessage,
    };
  }
};

export const searchVenues = async (id) => {
  const record = await findPlayer(id);
  const { date, time, q, sport } = record[0].result[0];

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

export const searchFacilities = async (id) => {
  const record = await findPlayer(id);
  const { venueId, sport, date, q, time } = record[0].result[0];

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

export const searchGears = async (id) => {
  const record = await findPlayer(id);
  const { sport, venueId } = record[0].result[0];
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

export const searchTimeSlots = async (id) => {
  const record = await findPlayer(id);
  const { date, time, facilityId } = record[0].result[0];

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

export const registerSlot = async (id) => {
  const player = await findPlayer(id);
  const { playerId, slots, facilityId } = player[0].result[0];

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

export const clearSlots = async (id) => {
  let record = await findPlayer(id);

  let { facilityId, playerId, slots } = record[0].result[0];

  if (slots.length === 0) {
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
    Sentry.captureException(e)
  }
};

export const createBookingPlayer = async (id) => {
  const player = await findPlayer(id);
  const { name, email, phone } = player[0].result[0];

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

export const createBooking = async (id) => {
  const player = await findPlayer(id);
  const { slots, facilityId, playerId, sport, friends, equipments } =
    player[0].result[0];
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



app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    const phoneNumber = value?.contacts?.[0]?.wa_id;
    const messageText = value?.messages?.[0]?.text?.body;
    console.log('phone number', phoneNumber);
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

    let record = await findPlayer(phoneNumber);

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

    // console.log(info.name, ":", message.body);
    if (info.name === undefined) {
      // console.log("undefined detected, full info is", info);
    }

    if (hi.includes(body) || firstMessage) {
      customer = (await loadCustomerInfo(info.number)).data;

      await savePlayer(id, {
        question: "Hi", // reset question on first message
        playerId: customer?.id,
        email: customer?.email,
      });

      await sendHiMessage(
        client,
        message,
        customer ? customer.displayName : info.pushname
      );
    } else if (body.toUpperCase() === "V") {
      if (!playerId) {
        // question = EmailQuestion;
        await savePlayer(id, {
          question: EmailQuestion,
        });
        await client.sendMessage(message.from, EmailQuestion);
      } else {
        await sendSportsQuestion(client, message, body, id);
      }
    } else if (body.toUpperCase() === "C") {
      await reset(id);

      await client.sendMessage(
        message.from,
        "Sorry to see that.\nHow can we help you then?\nPlease reply with *V* if you want to book a venue."
      );
    } else {
      if (question === EmailQuestion) {
        // email = body;
        if (!isValidEmail(body)) {
          await client.sendMessage(
            message.from,
            "Invalid email address, please try again"
          );
          return;
        }
        const customerData = await loadCustomerInfo(body.trim());
        if (customerData.error) {
          await client.sendMessage(message.from, customerData.error);
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
          await client.sendMessage(message.from, "Creating new user account for you.");
          const d = await createBookingPlayer(id);
          customer = d;

          await client.sendMessage(
            message.from,
            `Account details:\nPlease visit *${WEB_URL}* or download *Tazman* app from Google Play or App Store.\nUsername: ${d.email}\n Password: ${d.password}`
          );
        }

        await sendSportsQuestion(client, message, body, id);
      } else if (question === VenueQuestion) {
        // find in cities/venues
        if (!venues[body.trim() - 1]) {
          await client.sendMessage(
            message.from,
            "Sorry this number is out of range, Select a venue number from list"
          );
        } else {
          // await sendSportsQuestion(client, message, body, id);
          await sendDateQuestion(client, message, body, id);
        }
      } else if (question === SportQuestion) {
        if (!sports[body.trim() - 1]) {
          await client.sendMessage(
            message.from,
            "Sorry this number is out of range, Select a sport number from list"
          );
        } else {
          await savePlayer(id, {
            sport: sports[body.trim() - 1],
          });
          await sendCityQuestion(client, message, id);
        }
      } else if (question === CityQuestion) {
        await sendVenueCityQuestion(client, message, id, body.trim());
      } else if (question === DateQuestion) {
        // parse date to match format
        if (body.trim().toLowerCase() === "flexible") {
          await sendVenuesMessage(client, body, message, id);

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
            await client.sendMessage(
              message.from,
              `Invalid date, please use *${DateTime.now().toFormat(
                "dd-MM-yyyy"
              )}* format, or type *flexible* to skip date constraint`
            );
          } else {
            if (parseDate.toFormat('dd-MM-yyyy') < DateTime.now().toFormat('dd-MM-yyyy')) {
              await client.sendMessage(
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

            await client.sendMessage(message.from, TimeQuestion);
            await client.sendMessage(
              message.from,
              `Please use *${DateTime.now().toFormat(
                "hh:mm a"
              )}* format, or type *flexible* to skip time constraint`
            );

            // date = body;
          }
        }
      } else if (question === TimeQuestion) {
        await sendVenuesMessage(client, body, message, id);
      } else if (question === VenuesQuestion) {
        // get facilites from api
        if (!foundVenues[body.trim() - 1]) {
          await client.sendMessage(
            message.from,
            "Invalid venue number, Select a valid number from list"
          );
        } else {
          await sendFacilitiesQuestion(client, message, body, id);
        }
      } else if (question === FacilitiesQuestion) {
        if (!foundFacilities[body.trim() - 1]) {
          await client.sendMessage(
            message.from,
            "Invalid facility number, Select a valid number from list"
          );
        } else {
          let fac = foundFacilities[body.trim() - 1].id;

          await sendSlotsQuestion(client, message, fac, id);
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
          await sendSlotsQuestion(client, message, selectedFacility, id);
        } else if (body.trim().toLowerCase() === "previous") {
          // go back in date
          let d = DateTime.fromFormat(date, "dd-MM-yyyy")
            .minus({ day: 1 })
            .toFormat("dd-MM-yyyy");

          await savePlayer(id, {
            date: d,
          });
          await sendSlotsQuestion(client, message, selectedFacility, id);
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
            await client.sendMessage(
              message.from,
              "Invalid slot numbers, Select slot numbers in order, you cannot skip slots from between"
            );
          } else {
            let selectedSlots = foundSlots.filter((item) => {
              return slotNumbers.includes(item.slotNumber.toString());
            });

            if (selectedSlots.length !== slotNumbers.length) {
              await client.sendMessage(
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

            await sendFriendsQuestion(client, message, body, id);
          }
        }
      } else if (question === EquipmentQuestion) {
        if (body.trim().toLowerCase() === "skip") {
          await savePlayer(id, {
            question: ConfirmationQuestion,
            equipments: [],
          });


          // client.sendMessage(
          //   message.from,
          //   `You have selected following items.\nSport: ${sport.name}\\nCity: ${city.name}\\nVenue: ${q.name}\\nDate: ${date}\\nTime: ${!time ? 'Flexible' : time}\n${ConfirmationQuestion}`
          // );
          await client.sendMessage(
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
            await client.sendMessage(
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
          await client.sendMessage(message.from, ConfirmationQuestion);
          // client.sendMessage(
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
            await client.sendMessage(
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

        await sendEquipmentQuestion(client, message, id);
      } else if (question === ConfirmationQuestion) {
        if (body.trim().toLowerCase() === "confirm") {
          await client.sendMessage(
            message.from,
            "Please wait creating booking for you"
          );

          const res = await findPlayer(id);
          const { playerId } = res[0].result[0];

          // create player
          let newCustomer = false;
          if (!playerId) {
            customer = await createBookingPlayer(id);
            newCustomer = true;
          }
          // create booking
          const r = await createBooking(id);

          if (r.error) {
            await client.sendMessage(message.from, r.error);

            return false;
          }

          if (r.data !== null) {
            await reset(id);

            let reservation = r.data;
            await client.sendMessage(
              message.from,
              `✔️ Booking created successfully, your booking# is *${reservation.bookingId}*. You will have to pay *SAR ${reservation.price / 100}* at the facility.`
            );

            await client.sendMessage(
              message.from,
              `Booking details:\n${WEB_URL}/en/whatsapp-booking-details/${reservation.id}\nFind Directions:\n${WEB_URL}/en/map?latitude=${reservation?.venueLong?.gisPoint?.latitude}&longitude=${reservation?.venueLong?.gisPoint?.longitude}`
            );

            if (newCustomer) {
              await client.sendMessage(message.from, ConfirmationQuestion3);

              await client.sendMessage(
                message.from,
                `Account details.\nPlease visit *${WEB_URL}* or download *Tazman* app from Google Play or App Store.\nUsername: ${customer.email}\n Password: ${customer.password}`
              );
            }
          }
        }
      } else {
        // console.log((await chat.getContact()).pushname, message.body);
      }
    }

    console.log("📱 Phone:", phoneNumber);
    console.log("💬 Message:", messageText);

    res.status(200).send("Webhook processed");
  } catch (err) {
    console.error("❌ Error processing webhook:", err);
    res.sendStatus(500);
  }
});

const isValidEmail = (email) => {
  const regex = new RegExp(/^[\w-+_\.]+@([\w-]+\.)+[\w-]{2,4}$/);
  return regex.test(email);
};


const sendDateQuestion = async (client, message, body, id) => {
  await savePlayer(id, {
    question: DateQuestion,
    q: venues[body.trim() - 1],
  });

  // client.sendMessage(message.from, DateQuestion);
  await client.sendMessage(
    message.from,
    `${DateQuestion}\nPlease use *${DateTime.now().toFormat(
      "dd-MM-yyyy"
    )}* format, or type *flexible* to skip date constraint`
  );
}

const sendFriendsQuestion = async (client, message, body, id) => {
  await client.sendMessage(message.from, FriendsQuestion);

  await savePlayer(id, {
    question: FriendsQuestion,
  });
};

const sendSportsQuestion = async (client, message, body, id) => {
  await savePlayer(id, {
    question: SportQuestion,
    sportsKeywords: sports,
    // q: venues[body],
  });

  await client.sendMessage(
    message.from,
    "You can always enter *C* to cancel the process."
  );
  await client.sendMessage(message.from, SportQuestion);
  await client.sendMessage(
    message.from,
    sports
      .map((item, index) => {
        return `${index + 1}. ${item.name}`;
      })
      .join("\n")
  );
};

const sendFacilitiesQuestion = async (client, message, body, id) => {
  let record = await findPlayer(id);

  // if (record[0].result[0].question) {
  let { foundVenues } = record[0].result[0];

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
    await client.sendMessage(
      message.from,
      `Found Facility ${foundFacilities[0].name}`
    );

    await sendSlotsQuestion(client, message, foundFacilities[0].id, id);
  } else {
    await client.sendMessage(message.from, FacilitiesQuestion);
    await client.sendMessage(
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

const sendEquipmentQuestion = async (client, message, id) => {
  let record = await findPlayer(id);

  // if (record[0].result[0].question) {
  let { sport, city, q, date, time, slots } = record[0].result[0];

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

    await client.sendMessage(message.from, EquipmentQuestion);
    await client.sendMessage(
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
    // client.sendMessage(
    //   message.from,
    //   `You have selected following items.\nSport: ${sport.name}\nCity: ${city.name}\nVenue: ${q.name}\nDate: ${date}\nTime: ${!time ? 'Flexible' : time}\nSlots: ${slots.map(slot => `${slot.startAt}`)}`
    // );
    await client.sendMessage(
      message.from,
      ConfirmationQuestion
    );
  }
};

const sendSlotsQuestion = async (client, message, selectedFacility, id) => {
  let record = await findPlayer(id);

  // if (record[0].result[0].question) {
  let { date, time } = record[0].result[0];

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
    await client.sendMessage(
      message.from,
      `Could not find slots in ${date} and ${time}, try again and select different date and time combinations.`
    );
  } else {
    await client.sendMessage(message.from, SlotsQuestion);
    await client.sendMessage(
      message.from,
      foundSlots
        .map((item) => {
          return `${item.slotNumber}. ${DateTime.fromISO(
            item.calendarEntry.startAt
          ).toFormat("dd-MM-yyyy hh:mm a")} till ${DateTime.fromISO(
            item.calendarEntry.endAt
          ).toFormat("dd-MM-yyyy hh:mm a")} for *SAR ${item.price / 100}*`;
        })
        .join("\n")
    );
  }

  await client.sendMessage(
    message.from,
    "Enter *next* or *previous* to move between dates"
  );
};

const sendCityQuestion = async (client, message, id) => {
  await loadCitiesList(id);

  await savePlayer(id, {
    question: CityQuestion,
    cityKeywords: cities,
    // email: message.body.trim(),
  });

  await client.sendMessage(message.from, CityQuestion);
  await client.sendMessage(
    message.from,
    cities
      .map((item, index) => {
        return `${index + 1}. ${item.name}`;
      })
      .join("\n")
  );
  if (cities.length === 1) {
    await client.sendMessage(message.from, `Only 1 city found. ✔️ *${cities[0].name}*`);

    await sendVenueCityQuestion(client, message, id, 1);
  }
};

const sendVenueCityQuestion = async (client, message, id, city) => {
  let record = await findPlayer(id);

  // if (record[0].result[0].question) {
  let { cityKeywords } = record[0].result[0];
  if (!cityKeywords[city - 1]) {
    await client.sendMessage(message.from, "Invalid city number, please try again");
    return false;
  }

  // question = VenueQuestion;
  await savePlayer(id, {
    question: VenueQuestion,
    venueKeywords: venues,
    city: cityKeywords[city - 1],
  });

  await loadVenueKeywords(id);

  await client.sendMessage(message.from, VenueQuestion);
  await client.sendMessage(
    message.from,
    venues
      .map((item, index) => {
        return `${index + 1}. ${item.name}`;
      })
      .join("\n")
  );
  if (venues.length === 1) {
    await client.sendMessage(
      message.from,
      `Only 1 venue found. ✔️ *${venues[0].name}*`
    );
    await savePlayer(id, {
      q: venues[0]
    })
    await sendDateQuestion(client, message, message.body, id);
  }
};

const sendVenuesMessage = async (client, body, message, id) => {
  let record = await findPlayer(id);

  // if (record[0].result[0].question) {
  let { date } = record[0].result[0];

  if (body.trim().toLowerCase() === "flexible") {
    time = null;

    await savePlayer(id, {
      // question: TimeQuestion,
      time: time,
    });

    await _sendVenuesMessage(client, body, message, id);
  } else {
    // parse date to match format
    const parseDate = DateTime.fromFormat(body, "hh:mm a");
    if (!parseDate.isValid) {
      await client.sendMessage(
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
        await client.sendMessage(
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

      await _sendVenuesMessage(client, body, message, id);
    }
  }
};

const _sendVenuesMessage = async (client, body, message, id) => {
  let record = await findPlayer(id);

  // if (record[0].result[0].question) {
  let { sport, city, q, date, time } = record[0].result[0];

  await client.sendMessage(message.from, AvailabilityQuestion);

  const data = await searchVenues(id);

  let foundVenues = data.data;

  await savePlayer(id, {
    foundVenues: foundVenues,
  });

  if (foundVenues.length === 0) {
    await client.sendMessage(
      message.from,
      "Sorry no venues available at the moment, you can try again with different search terms."
    );
    // client.sendMessage(
    //   message.from,
    //   `Sport: ${sport.name}\nCity: ${city.name}\nVenue: ${q.name}\nDate: ${date}\nTime: ${!time ? 'Flexible' : time}`
    // );
    await client.sendMessage(
      message.from,
      'Try again with sport selection'
    );
    await sendSportsQuestion(client, message, body, id);

    await savePlayer(id, {
      question: SportQuestion,
    });

  } else {
    if (foundVenues.length === 1) {
      // send facilities message
      await client.sendMessage(message.from, `Found ${foundVenues[0].name}`);
      await sendFacilitiesQuestion(client, message, "0", id);
    } else {
      // question = VenuesQuestion;
      await savePlayer(id, {
        question: VenuesQuestion,
      });

      await client.sendMessage(
        message.from,
        `Found ${foundVenues.length} venues, Select a venue number from list`
      );
      await client.sendMessage(
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






