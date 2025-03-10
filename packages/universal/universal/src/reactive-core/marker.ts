import {
  type Description,
  callerStack,
  descriptionFrom,
} from "@starbeam/debug";
import type { Stack } from "@starbeam/interfaces";
import { type ReactiveProtocol, REACTIVE, TIMELINE } from "@starbeam/timeline";

import { type MutableInternalsImpl, MutableInternals } from "../storage.js";

export class ReactiveMarker implements ReactiveProtocol<MutableInternals> {
  static create(internals: MutableInternalsImpl): ReactiveMarker {
    return new ReactiveMarker(internals);
  }

  readonly #internals: MutableInternalsImpl;

  private constructor(reactive: MutableInternalsImpl) {
    this.#internals = reactive;
  }

  get [REACTIVE](): MutableInternals {
    return this.#internals;
  }

  freeze(): void {
    this.#internals.freeze();
  }

  consume(caller = callerStack()): void {
    TIMELINE.didConsumeCell(this, caller);
  }

  update(caller: Stack): void {
    this.#internals.update(caller);
  }
}

export function Marker(description?: string | Description): ReactiveMarker {
  return ReactiveMarker.create(
    MutableInternals(
      descriptionFrom({
        type: "cell",
        api: {
          package: "@starbeam/universal",
          name: "Marker",
        },
        fromUser: description,
      })
    )
  );
}

export type Marker = ReactiveMarker;
