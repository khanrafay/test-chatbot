import WebSocket from "ws";

const SOCKET_URL = "wss://tazman.pro/wss";
// const SOCKET_URL = "ws://localhost:8000";

const socket = new WebSocket(SOCKET_URL);

export default socket;
