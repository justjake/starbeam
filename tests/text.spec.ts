import { SimpleText } from "@simple-dom/interface";
import {
  Timeline,
  Reactive,
  ReactiveTextNode,
  SimpleDomTypes,
  Rendered,
} from "../src/index";

let timeline = Timeline.simpleDOM();

afterEach(() => (timeline = Timeline.simpleDOM()));

enum Expects {
  dynamic = "dynamic",
  static = "static",
}

test("dynamic text", () => {
  let cell = timeline.reactive("hello");
  let text = buildText(cell, Expects.dynamic);

  let result = render(text, Expects.dynamic);
  expect(result.node.nodeValue).toBe("hello");

  cell.update("goodbye");
  timeline.poll(result);

  expect(result.node.nodeValue).toBe("goodbye");
});

test("static text", () => {
  let hello = timeline.static("hello");
  let text = buildText(hello, Expects.static);

  let { node } = render(text, Expects.static);
  expect(node.nodeValue).toBe("hello");
});

function normalize(isStatic: boolean): Expects {
  return isStatic ? Expects.static : Expects.dynamic;
}

function buildText(
  reactive: Reactive<string>,
  expectation: Expects
): ReactiveTextNode<SimpleDomTypes> {
  let text = timeline.dom.text(reactive);
  expect(normalize(text.metadata.isStatic)).toBe(expectation);
  return text;
}

function render(
  text: ReactiveTextNode<SimpleDomTypes>,
  expectation: Expects
): Rendered<SimpleDomTypes, SimpleText> {
  let rendered = timeline.render(text);

  expect(
    normalize(rendered.metadata.isConstant),
    `Render should produce ${expectation} output.`
  ).toBe(expectation);

  return rendered;
}
