import { isObject } from "@starbeam/core-utils";
import {
  type Description,
  type Stack,
  callerStack,
  descriptionFrom,
  DisplayStruct,
} from "@starbeam/debug";
import type * as interfaces from "@starbeam/interfaces";
import { UNINITIALIZED } from "@starbeam/shared";
import { type Reactive, INSPECT, REACTIVE, TIMELINE } from "@starbeam/timeline";

import type { MutableInternalsImpl } from "../storage.js";
import { MutableInternals } from "../storage.js";

export interface CellPolicy<T, U = T> {
  equals: (a: T, b: T) => boolean;
  map: (value: T) => U;
}

export type Equality<T> = (a: T, b: T) => boolean;

export class ReactiveCell<T>
  implements Reactive<T, interfaces.MutableInternals>
{
  static create<T>(
    value: T,
    internals: MutableInternalsImpl,
    equals: Equality<T> = Object.is
  ): ReactiveCell<T> {
    return new ReactiveCell(value, equals, internals);
  }

  #value: T;
  readonly #internals: MutableInternalsImpl;
  readonly #equals: Equality<T>;

  declare [INSPECT]: () => object;

  private constructor(
    value: T,
    equals: Equality<T>,
    reactive: MutableInternalsImpl
  ) {
    this.#value = value;
    this.#equals = equals;
    this.#internals = reactive;

    if (import.meta.env.DEV) {
      this[INSPECT] = (): object => {
        const { description, lastUpdated } = this.#internals;

        const desc = ` (${description.describe()})`;

        return DisplayStruct(`Cell${desc}`, {
          value: this.#value,
          updated: lastUpdated,
        });
      };

      Object.defineProperty(this, "toString", {
        enumerable: false,
        configurable: true,
        writable: true,
        value: (): string => `Cell (${String(this.#value)})`,
      });
    }
  }

  freeze(): void {
    this.#internals.freeze();
  }

  get current(): T {
    return this.read(callerStack());
  }

  set current(value: T) {
    this.#set(value, callerStack());
  }

  read(caller = callerStack()): T {
    TIMELINE.didConsumeCell(this, caller);
    return this.#value;
  }

  /**
   * Returns true if the value was updated, and false if the value was already present and equal to
   * the new value.
   */
  set(value: T, caller = callerStack()): boolean {
    return this.#set(value, caller);
  }

  update(updater: (prev: T) => T, caller = callerStack()): boolean {
    return this.#set(updater(this.#value), caller);
  }

  initialize(initializer: () => T, caller = callerStack()): T {
    if (this.#value === UNINITIALIZED) {
      this.#set(initializer(), caller);
    }

    return this.#value;
  }

  #set(value: T, caller: Stack): boolean {
    if (this.#equals(this.#value, value)) {
      return false;
    }

    this.#value = value;
    this.#internals.update(caller);
    return true;
  }

  get [REACTIVE](): MutableInternals {
    return this.#internals;
  }
}

const INITIAL_INTERNAL_FRAMES = 0;

/**
 * The `equals` parameter is used to determine whether a new value is equal to
 * the current value. If `equals` returns `true` for a new value, the old value
 * remains in the cell and the cell's timestamp doesn't advance.
 *
 * It defaults to `Object.is` (`===` except that `Object.is(NaN, NaN)` is
 * `true`).
 * */

export function Cell<T>(
  value: T,
  description?:
    | string
    | { description?: string | Description; equals?: Equality<T> }
): Cell<T> {
  let desc: Description;
  let equals: Equality<T>;

  if (typeof description === "string" || description === undefined) {
    desc = normalize(description);
    equals = Object.is;
  } else {
    desc = normalize(description.description);
    equals = description.equals ?? Object.is;
  }

  return ReactiveCell.create(value, MutableInternals(desc), equals);
}

const CALLER_FRAME = 1;

function normalize(
  description: string | Description | undefined,
  internal = INITIAL_INTERNAL_FRAMES
): Description {
  if (typeof description === "string" || description === undefined) {
    return descriptionFrom(
      {
        type: "cell",
        api: {
          package: "@starbeam/universal",
          name: "Cell",
        },
        fromUser: description,
      },
      internal + CALLER_FRAME
    );
  }

  return description;
}

Cell.is = <T>(value: unknown): value is Cell<T> => {
  return isObject(value) && value instanceof ReactiveCell;
};

export type Cell<T = unknown> = ReactiveCell<T>;
