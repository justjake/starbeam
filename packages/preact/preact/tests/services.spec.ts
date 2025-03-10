// @vitest-environment jsdom

import { setup } from "@starbeam/preact";
import { service } from "@starbeam/universal";
import {
  type HtmlNode,
  html,
  rendering,
} from "@starbeam-workspace/preact-testing-utils";
import {
  describe,
  resources,
  TestResource,
} from "@starbeam-workspace/test-utils";
import { options } from "preact";
import { beforeAll, expect } from "vitest";

describe("services", () => {
  beforeAll(() => {
    setup(options);
  });

  rendering.test(
    "services are like resources",
    function App() {
      const test = service(TestResource);
      return html`<p>${test.id}</p>`;
    },
    (root) =>
      root
        .expect(({ id }: { id: number }) => html`<p>${id}</p>`)
        .render({ id: resources.nextId })
        .unmount({
          after: () => {
            expect(resources.last.isActive).toBe(false);
          },
        })
  );

  function Inner(): HtmlNode {
    const test = service(TestResource);
    return html`<p>inner: ${test.id}</p>`;
  }

  rendering.test(
    "a service is only instantiated once",
    function App({ id }: { id: number }): HtmlNode {
      const test = service(TestResource);
      return html`<p>id prop: ${id}</p>
        <p>outer: ${test.id}</p>
        <${Inner} />`;
    },
    (root) =>
      root
        .expect(
          ({ id }) =>
            html`<p>id prop: ${id}</p>
              <p>outer: ${resources.last.id}</p>
              <p>inner: ${resources.last.id}</p>`
        )
        .render({ id: 1 })
        .render({ id: 2 })
        .unmount({
          after: () => {
            expect(resources.last).toSatisfy((r) => !r.isActive);
          },
        })
  );
});
