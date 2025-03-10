import "./devtool.css";

import type {
  DebugListener,
  DebugOperation,
  Description,
} from "@starbeam/debug";
import type { MutableInternals } from "@starbeam/interfaces";
import { ReactiveProtocol, TIMELINE } from "@starbeam/timeline";
import { isPresent, verified } from "@starbeam/verify";
import { type JSX, render } from "preact";

export function DevtoolsFor(props: {
  reactive: ReactiveProtocol;
  log: DebugOperation[];
}): JSX.Element {
  function computeDependencies(): Iterable<MutableInternals> {
    return ReactiveProtocol.dependencies(props.reactive);
  }

  function computeInvalidated(): MutableInternals[] {
    return props.log
      .map((operation) => operation.for)
      .filter(
        (value): value is MutableInternals =>
          value !== undefined && value.type === "mutable"
      );
  }

  const invalidated = computeInvalidated();

  return (
    <>
      <details class="starbeam-devtool">
        <summary>🧑‍💻</summary>
        <section class="dependencies">
          <ul class="dependencies">
            <li>
              <span class="specified">description</span>
              <span class="kind">
                {ReactiveProtocol.description(props.reactive).fullName}
              </span>
            </li>
            <li>
              <span class="specified">last updated</span>
              <span class="kind">{String(TIMELINE.now)}</span>
            </li>
          </ul>
          <h1>Dependencies</h1>
          <ul class="dependencies">
            {unique([...computeDependencies()]).map((d) => (
              <li>
                <Dependency description={d} />
              </li>
            ))}
          </ul>
          <h1>Last Invalidated</h1>
          <ul class="dependencies">
            {invalidated.length ? (
              unique(invalidated).map((d) => (
                <li>
                  <Dependency description={d} />
                </li>
              ))
            ) : (
              <li>None</li>
            )}
          </ul>
        </section>
      </details>
    </>
  );
}

function Dependency({
  description,
}: {
  description: Description;
}): JSX.Element {
  const specified = <span class="specified">{description.fullName}</span>;

  function displayLink(): void {
    if (description.fullName) {
      console.log(
        "%c%s @ %s",
        "color:red",
        description.fullName,
        description.frame?.display()
      );
    } else {
      console.log("%c%s", "color:red", description.frame?.display());
    }
  }

  return (
    <>
      {specified}
      <button type="button" onClick={displayLink}>
        log {description.type} location
      </button>
    </>
  );
}

function unique(dependencies: MutableInternals[]): Description[] {
  const descriptions = new Set(
    dependencies.map((d) => d.description.userFacing)
  );

  return [...descriptions];
}

export default function DevtoolsPane(
  renderable: ReactiveProtocol,
  log: DebugOperation[],
  into: Element
): { update: (reactive: ReactiveProtocol, log: DebugOperation[]) => void } {
  const app = <DevtoolsFor reactive={renderable} log={log} />;

  render(app, into);

  return {
    update: (reactive: ReactiveProtocol, log: DebugOperation[]) => {
      render(<DevtoolsFor reactive={reactive} log={log} />, into);
    },
  };
}

export function DevTools(
  listener: DebugListener,

  reactive: ReactiveProtocol
): () => void {
  const pane = DevtoolsPane(
    reactive,
    listener.flush(),
    verified(document.querySelector("#devtools"), isPresent)
  );

  return () => {
    const log = listener.flush();

    pane.update(reactive, log);
  };
}
