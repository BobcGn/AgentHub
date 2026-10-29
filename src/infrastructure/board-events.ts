import type { ServerResponse } from 'node:http';

interface Subscriber { send(frame: string): void; close(): void }
// Notifications carry no board contents. Reconnect always reads the authorized snapshot.
export class BoardEvents {
  private readonly subscribers = new Set<Subscriber>();

  subscribe(response: ServerResponse, authenticated: () => boolean): void {
    response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    const subscriber: Subscriber = {
      send: frame => {
        if (response.writableEnded || response.destroyed) return;
        if (!authenticated()) {
          response.write('event: session-expired\ndata: {}\n\n');
          subscriber.close();
          return;
        }
        if (!response.write(frame)) subscriber.close();
      },
      close: () => {
        clearInterval(heartbeat);
        this.subscribers.delete(subscriber);
        response.end();
      }
    };
    const heartbeat = setInterval(() => subscriber.send(': heartbeat\n\n'), 15_000);
    heartbeat.unref();
    response.once('close', () => {
      clearInterval(heartbeat);
      this.subscribers.delete(subscriber);
    });
    this.subscribers.add(subscriber);
    subscriber.send('retry: 1000\n: connected\n\n');
  }

  publish(): void {
    for (const subscriber of this.subscribers) subscriber.send('data: {}\n\n');
  }

  close(): void {
    for (const subscriber of this.subscribers) subscriber.close();
  }
}
