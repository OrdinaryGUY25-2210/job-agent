import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import type { AgentEvent, AgentWSServerMessage, DashboardWSServerMessage } from '@jobagent/types';

const OPEN = 1;

type Socket = WebSocket & { isAlive?: boolean };

interface Member {
  socket: Socket;
  scope: 'dashboard' | 'runner';
}

export class Hub {
  private members = new Map<string, Set<Member>>();
  private owner = new WeakMap<Socket, string>();

  subscribe(userId: string, scope: 'dashboard' | 'runner', socket: Socket): void {
    this.unsubscribe(socket);
    const set = this.members.get(userId) ?? new Set<Member>();
    set.add({ socket, scope });
    this.members.set(userId, set);
    this.owner.set(socket, userId);
  }

  unsubscribe(socket: Socket): void {
    const userId = this.owner.get(socket);
    this.owner.delete(socket);
    if (!userId) return;
    const set = this.members.get(userId);
    if (!set) return;
    for (const m of set) {
      if (m.socket === socket) set.delete(m);
    }
    if (set.size === 0) this.members.delete(userId);
  }

  pushToUser(userId: string, message: AgentWSServerMessage | DashboardWSServerMessage): void {
    const set = this.members.get(userId);
    if (!set) return;
    const raw = JSON.stringify(message);
    for (const m of set) {
      if (m.socket.readyState === OPEN) m.socket.send(raw);
    }
  }

  pushToRunners(userId: string, message: AgentWSServerMessage): void {
    const set = this.members.get(userId);
    if (!set) return;
    const raw = JSON.stringify(message);
    for (const m of set) {
      if (m.scope === 'runner' && m.socket.readyState === OPEN) m.socket.send(raw);
    }
  }

  pushEvent(userId: string, event: AgentEvent): void {
    this.pushToUser(userId, event);
  }

  connectedRunners(): number {
    let n = 0;
    for (const set of this.members.values()) {
      for (const m of set) if (m.scope === 'runner') n++;
    }
    return n;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    hub: Hub;
  }
}

export function registerWebSocket(app: FastifyInstance): void {
  app.decorate('hub', new Hub());

  app.get('/ws', { websocket: true }, (socketRaw, req) => {
    const socket = socketRaw as Socket;
    const raw = (req.query as Record<string, unknown>)['token'];
    if (typeof raw !== 'string') {
      socket.close(4001, 'missing token');
      return;
    }
    void authenticate(app, socket, raw);
  });
}

async function authenticate(app: FastifyInstance, socket: Socket, token: string): Promise<void> {
  const { verifyToken } = await import('../lib/auth.js');
  const claims = await verifyToken(token);
  if (!claims?.sub) {
    socket.close(4002, 'invalid token');
    return;
  }
  app.hub.subscribe(claims.sub, claims.scope === 'runner' ? 'runner' : 'dashboard', socket);
  socket.on('close', () => app.hub.unsubscribe(socket));
}