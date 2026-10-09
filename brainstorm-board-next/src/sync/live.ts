import type { RealtimeChannel } from "@supabase/supabase-js";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import { supabase } from "./client";
import type { FrameMeta } from "./remote";

// One realtime channel per board. Broadcast carries edits as they happen;
// presence says who is here and which frame they're on. The database (see
// remote.ts) is the durable copy that people load when they join.

export type Peer = { key: string; name: string; color: string; frameId: string };

export type PointerMsg = {
  key: string;
  frameId: string;
  x: number;
  y: number;
  tool: "pointer" | "laser";
  button: "up" | "down";
};

export type LiveStatus = "connecting" | "live" | "offline";

type Handlers = {
  onElements: (frameId: string, elements: ExcalidrawElement[]) => void;
  onFrames: (upserted: FrameMeta[], deleted: string[]) => void;
  onTitle: (title: string) => void;
  onPeers: (peers: Peer[]) => void;
  onPointer: (p: PointerMsg) => void;
  onStatus: (s: LiveStatus) => void;
  /** Called when the connection comes back after a drop, to catch up. */
  onReconnect: () => void;
};

const COLORS = ["#149a49", "#4750a2", "#f15922", "#2a8f8e", "#b8860b", "#8e44ad", "#c0392b", "#16a085"];

export const colorFor = (key: string) => {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
};

const CHUNK = 100;

export class LiveSession {
  readonly key = crypto.randomUUID();
  readonly color = colorFor(this.key);
  private channel: RealtimeChannel;
  private me: Omit<Peer, "key">;
  private wasLive = false;
  private closed = false;

  constructor(boardId: string, name: string, frameId: string, private h: Handlers) {
    if (!supabase) throw new Error("Sharing isn't set up.");
    this.me = { name, color: this.color, frameId };
    this.channel = supabase.channel(`board:${boardId}`, {
      config: { broadcast: { self: false }, presence: { key: this.key } },
    });
    this.channel
      .on("broadcast", { event: "elements" }, ({ payload }) => h.onElements(payload.frameId, payload.elements))
      .on("broadcast", { event: "frames" }, ({ payload }) => h.onFrames(payload.upserted ?? [], payload.deleted ?? []))
      .on("broadcast", { event: "title" }, ({ payload }) => h.onTitle(payload.title))
      .on("broadcast", { event: "pointer" }, ({ payload }) => h.onPointer(payload))
      .on("presence", { event: "sync" }, () => {
        const state = this.channel.presenceState<Omit<Peer, "key">>();
        h.onPeers(
          Object.entries(state)
            .filter(([k, metas]) => k !== this.key && metas.length)
            .map(([k, metas]) => ({ key: k, name: metas[0].name, color: metas[0].color, frameId: metas[0].frameId })),
        );
      })
      .subscribe((status) => {
        if (this.closed) return;
        if (status === "SUBSCRIBED") {
          void this.channel.track(this.me);
          h.onStatus("live");
          if (this.wasLive) h.onReconnect();
          this.wasLive = true;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          h.onStatus("offline");
        }
      });
    h.onStatus("connecting");
  }

  private send(event: string, payload: unknown) {
    void this.channel.send({ type: "broadcast", event, payload });
  }

  sendElements(frameId: string, elements: readonly ExcalidrawElement[]) {
    for (let i = 0; i < elements.length; i += CHUNK) {
      this.send("elements", { frameId, elements: elements.slice(i, i + CHUNK) });
    }
  }

  sendFrames(upserted: FrameMeta[], deleted: string[] = []) {
    this.send("frames", { upserted, deleted });
  }

  sendTitle(title: string) {
    this.send("title", { title });
  }

  sendPointer(p: Omit<PointerMsg, "key">) {
    this.send("pointer", { ...p, key: this.key });
  }

  setFrame(frameId: string) {
    this.me = { ...this.me, frameId };
    void this.channel.track(this.me);
  }

  close() {
    this.closed = true;
    void supabase?.removeChannel(this.channel);
  }
}
