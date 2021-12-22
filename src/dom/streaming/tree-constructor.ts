// import type { AnyNode } from "./simplest-dom";
import type * as minimal from "@domtree/minimal";
import { HtmlBuffer } from "../cursor/append";
import type * as dom from "./compatible-dom";
import { COMPATIBLE_DOM, Hydrated } from "./compatible-dom";
import {
  Transform,
  ContentMarker,
  TEMPLATE_MARKER,
  BodyTransform,
} from "./marker";
import { Token, tokenId } from "./token";

export type ContentOperationOptions = {
  readonly token: true;
};

export const ContentOperationOptions = {
  requestedToken(options: ContentOperationOptions | undefined): boolean {
    return options === undefined ? false : options.token;
  },
} as const;

export const TOKEN: ContentOperationOptions = { token: true };

export interface ContentOperation {
  readonly append: BodyTransform;
  readonly marker: ContentMarker;
}

export class TextOperation implements ContentOperation {
  static of(data: string): TextOperation {
    return new TextOperation(data);
  }

  #text: string;

  private constructor(text: string) {
    this.#text = text;
  }

  readonly marker = TEMPLATE_MARKER;

  readonly append = Transform((buffer) => buffer.text(this.#text));
}

export class CommentOperation implements ContentOperation {
  static of(data: string): CommentOperation {
    return new CommentOperation(data);
  }

  readonly marker = TEMPLATE_MARKER;

  #data: string;

  constructor(text: string) {
    this.#data = text;
  }

  readonly append = Transform((buffer) => buffer.comment(this.#data));
}

export type AnyDataOperation = TextOperation | CommentOperation;
export type AnyContentOperation = AnyDataOperation;

interface HTMLParser {
  (string: string): dom.CompatibleDocumentFragment;
}

/**
 * `TreeConstructor` builds up a valid string of HTML, which it then gives to the browsers'
 */
export class TreeConstructor {
  static html(): TreeConstructor {
    return new TreeConstructor();
  }

  static text(data: string): TextOperation {
    return TextOperation.of(data);
  }

  static comment(data: string): CommentOperation {
    return CommentOperation.of(data);
  }

  readonly #buffer = HtmlBuffer.create();
  #id = 0;

  private constructor() {}

  add(operation: ContentOperation, options: ContentOperationOptions): Token;
  add(operation: ContentOperation): void;
  add(
    operation: ContentOperation,
    options?: ContentOperationOptions
  ): void | Token {
    if (options === TOKEN) {
      let token = this.#nextToken();
      operation.marker(this.#buffer, token, operation.append);
      return token;
    } else {
      operation.append(this.#buffer);
    }
  }

  construct(parse: HTMLParser): {
    fragment: dom.CompatibleDocumentFragment;
  } {
    return { fragment: parse(this.#buffer.serialize()) };
  }

  #nextToken() {
    return Token.of(String(this.#id++));
  }
}

export type Range =
  | {
      type: "range";
      start: minimal.Node;
      end: minimal.Node;
    }
  | {
      type: "node";
      node: minimal.Node;
    };

export type HydratedTokens = ReadonlyMap<Token, Hydrated>;

export class TreeHydrator {
  static hydrate(
    document: dom.CompatibleDocument,
    fragment: dom.CompatibleDocumentFragment,
    tokens: Set<Token>
  ): HydratedTokens {
    let tokenMap = new Map<string, Token>();

    for (let token of tokens) {
      tokenMap.set(tokenId(token), token);
    }

    return new TreeHydrator(
      document as minimal.Document,
      fragment as minimal.DocumentFragment,
      tokenMap
    ).#hydrate();
  }

  readonly #document: minimal.Document;
  readonly #fragment: minimal.DocumentFragment;
  readonly #tokens: Map<string, Token>;

  constructor(
    document: minimal.Document,
    fragment: minimal.DocumentFragment,
    tokens: Map<string, Token>
  ) {
    this.#document = document;
    this.#fragment = fragment;
    this.#tokens = tokens;
  }

  #hydrate(): HydratedTokens {
    let nodes = COMPATIBLE_DOM.findAll(this.#fragment, {
      attributes: {
        any: ["data-starbeam-marker:attrs", "data-starbeam-marker:contents"],
      },
    });

    let hydrated = new Map<Token, Hydrated>();
    let tokens = this.#tokens;

    if (nodes) {
      for (let element of nodes) {
        let attrMarker = COMPATIBLE_DOM.getAttr(
          element,
          "data-starbeam-marker:attrs"
        );

        let contentMarker = COMPATIBLE_DOM.getAttr(
          element,
          "data-starbeam-marker:contents"
        );

        if (contentMarker) {
          let tokenId = contentMarker.value;

          if (tokens.has(tokenId)) {
            if (!isTemplateElement(element)) {
              throw Error(
                "Unexpected: an element with data-starbeam-marker:contents was unexpectedly not a template. This is a bug."
              );
            }

            let contents = COMPATIBLE_DOM.getTemplateContents(element);
            let body = hydrateTemplate(this.#document, element, contents);

            hydrated.set(Token.of(tokenId), body);
          }
        }

        if (attrMarker) {
          throw Error("todo: TreeHydrator attributes");
        }
      }
    }

    return hydrated;
  }
}

function isTemplateElement(
  element: minimal.Element
): element is minimal.TemplateElement {
  return element.tagName === "TEMPLATE";
}

function hydrateTemplate(
  document: minimal.Document,
  template: minimal.TemplateElement,
  fragment: minimal.DocumentFragment
): Hydrated {
  let { firstChild, lastChild } = fragment;

  if (firstChild === null) {
    let comment = document.createComment(`<!-- empty -->`);
    COMPATIBLE_DOM.replace(template, comment);

    return { type: "node", node: comment as minimal.Comment };
  }

  COMPATIBLE_DOM.replace(template, fragment);

  if (firstChild === lastChild) {
    return { type: "node", node: firstChild as minimal.Node };
  } else {
    return {
      type: "range",
      range: [firstChild as minimal.Node, lastChild as minimal.Node],
    };
  }
}
