import { io, Socket } from 'socket.io-client';
let socket: Socket | null = null;
let socketToken: string | null = null;

function readToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('sn_token') : null;
}

export function getSocket(): Socket {
  const token = readToken();
  if (!socket || socketToken !== token) {
    socket?.disconnect();
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, { auth: { token }, transports: ['websocket','polling'], autoConnect: false });
    socketToken = token;
  }
  return socket;
}
export function connectSocket() { const s = getSocket(); if (!s.connected) s.connect(); return s; }
export function disconnectSocket() { socket?.disconnect(); socket = null; socketToken = null; }
