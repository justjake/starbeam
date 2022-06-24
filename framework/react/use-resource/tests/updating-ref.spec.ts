// @vitest-environment jsdom

import { expect } from "vitest";

import { useUpdatingRef } from "../src/updating-ref.js";
import { react } from "./dom.js";
import { testModes } from "./modes.js";

// eslint-disable-next-line @typescript-eslint/require-await
testModes("useUpdatingRef.mutable", async (mode) => {
  const result = mode
    .render(() => {
      const { ref, value } = useUpdatingRef.mutable({
        initial: () => ({ count: 0 }),
        update: (counter) => {
          counter.count++;
          return counter;
        },
      });

      return {
        value: ref,
        dom: react.fragment(value.count),
      };
    })
    .expectStableValue()
    .expectHTML(({ current: counter }) => `${counter.count}`);

  const ref = result.value;

  expect(result.count).toBe(mode.match({ strict: () => 2, loose: () => 1 }));
  expect(ref.current.count).toBe(0);

  result.rerender();

  expect(ref.current.count).toBe(
    mode.match({
      loose: () => 1,
      strict: () => 2,
    })
  );
});
