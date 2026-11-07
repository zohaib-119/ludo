import { defineRoom, defineServer, matchMaker } from '@colyseus/core';
import { ROOM_NAME, parseRoomCode } from '@ludo/protocol';
import { LudoRoom } from './room';

export function createServer() {
  return defineServer({
    greet: false,
    rooms: { [ROOM_NAME]: defineRoom(LudoRoom) },
    express: (app) => {
      // Read-only public endpoints: allow the web client on another origin (dev server, static host).
      app.use('/api', (_req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        next();
      });
      app.get('/healthz', (_req, res) => {
        // The web app pings this from its own origin to wake a sleeping host early.
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.json({ ok: true });
      });
      /** Does a room exist, and can a new player still join it? */
      app.get('/api/rooms/:code', (req, res) => {
        const code = parseRoomCode(String(req.params.code ?? ''));
        const room = code ? (matchMaker.getLocalRoomById(code) as unknown as LudoRoom | undefined) : undefined;
        if (!room?.controller) {
          res.json({ exists: false });
          return;
        }
        const view = room.controller.view();
        res.json({
          exists: true,
          phase: view.phase,
          seatsTaken: Object.keys(view.seats).length,
          members: view.members.length,
        });
      });
    },
  });
}
