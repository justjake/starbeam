import type { Options } from "preact";

import type { AnyFn, RawPreactOptions } from "./interfaces.js";
import {
  type MangledPreactOptionName,
  type PreactHook,
  type PreactOptionName,
  isProbablyVNode,
} from "./internals.js";
import { InternalComponent } from "./internals/component.js";
import { InternalElement } from "./internals/elements.js";
import { HookType } from "./internals/hooks.js";
import {
  getVNodeComponent,
  InternalVNode,
  isUserspaceComponent,
} from "./internals/vnode.js";

export function Plugin(
  updater: (callback: AugmentPreact) => void
): (options: RawPreactOptions) => void {
  return (options) => {
    updater(new AugmentPreact(options));
  };
}

export class AugmentPreact {
  readonly component: AugmentPreactAsComponent;
  readonly #original: RawPreactOptions;

  constructor(original: RawPreactOptions) {
    this.#original = original;
    this.component = new AugmentPreactAsComponent(original);
  }

  root(hook: (vnode: InternalVNode, parent: InternalElement) => void): void {
    createHook(this.#original, "_root", (vnode, parent) => {
      if (isProbablyVNode(vnode)) {
        hook(InternalVNode.from(vnode), InternalElement.of(parent));
      }
    });
  }

  unroot(hook: (parent: InternalElement) => void): void {
    createHook(this.#original, "_root", (vnode, parent) => {
      if (vnode === null) {
        hook(InternalElement.of(parent));
      }
    });
  }

  /**
   * Whenever a vnode is created, this hook gives you an opportunity to rewrite the vnode before
   * it's otherwise used by Preact.
   */
  vnode(hook: (vnode: InternalVNode, handler: Handler) => void): void {
    createHook(this.#original, "vnode", (vnode, handler) => {
      hook(InternalVNode.from(vnode), handler);
    });
  }

  /**
   * This plugin hook is called whenever a Hook is created.
   */
  hook(
    hook: (
      options: {
        component: InternalComponent;
        index: number;
        type: HookType;
      },
      handler: Handler
    ) => void
  ): void {
    createHook(this.#original, "_hook", (component, index, type, handler) => {
      hook(
        {
          component: InternalComponent.of(component),
          index,
          type: HookType.of(type),
        },
        handler
      );
    });
  }

  /**
   * This plugin hook is called before a vnode is rendered. If you need to wrap the call to the
   * vnode's render function, this is where you can start the wrapping.
   *
   * For example, Starbeam uses this hook to start a tracking frame.
   */
  willRender(hook: (vnode: InternalVNode, handler: Handler) => void): void {
    createHook(this.#original, "_render", (vnode, handler) => {
      hook(InternalVNode.of(vnode), handler);
    });
  }

  diff(hook: (vnode: InternalVNode, handler: Handler) => void): void {
    createHook(this.#original, "_diff", (vnode, handler) => {
      hook(InternalVNode.of(vnode), handler);
    });
  }

  /**
   * This plugin hook is called after a vnode is rendered and diffed, but before anything else
   * happens. If you started wrapping rendering in `render`, you should end it here.
   */
  didRender(hook: (vnode: InternalVNode, handler: Handler) => void): void {
    createHook(this.#original, "diffed", (vnode, handler) => {
      hook(InternalVNode.from(vnode), handler);
    });
  }

  /**
   * This plugin hook is called whenever a vnode is unmounted from the DOM.
   *
   * If you set something up in `render` or `diffed` that needs to be cleaned up, this is the place
   * to do it.
   */
  unmount(hook: (vnode: InternalVNode, handler: Handler) => void): void {
    createHook(this.#original, "unmount", (vnode, handler) => {
      hook(InternalVNode.from(vnode), handler);
    });
  }

  catchError(
    hook: (
      options: {
        error: unknown;
        vnode: InternalVNode;
        oldVNode: InternalVNode;
        errorInfo: Record<PropertyKey, unknown>;
      },
      handler: Handler
    ) => void
  ): void {
    createHook(
      this.#original,
      "_catchError",
      (error, vnode, oldVNode, errorInfo, handler) => {
        hook(
          {
            error,
            vnode: InternalVNode.of(vnode),
            oldVNode: InternalVNode.of(oldVNode),
            errorInfo,
          },
          handler
        );
      }
    );
  }
}

function createHook<
  K extends PreactOptionName,
  V extends AnyFn = PreactHook<K>
>(
  originalOptions: RawPreactOptions,
  hookName: K,
  hook: (...args: [...args: Parameters<V>, handler: Handler]) => void
): void {
  const [originalFn, mangled] = getOriginal(originalOptions, hookName);

  originalOptions[mangled] = ((...args: HookParams<K>) => {
    const handler = AugmentHandler.create(
      hookName,
      originalFn && (() => originalFn(...args))
    );

    hook(...args, handler);

    AugmentHandler.finish(handler);
  }) as AnyFn;
}

function getOriginal(
  original: RawPreactOptions,
  name: PreactOptionName
): [
  fn: ((...args: unknown[]) => unknown) | undefined,
  mangled: MangledPreactOptionName
] {
  const mangled = getHookName(name);

  return [original[mangled] as AnyFn, mangled];
}

export const HOOK_NAMES = {
  _hook: "__h",
  _diff: "__b",
  _render: "__r",
  _catchError: "__e",
  _root: "__",
} as const;

type HookNames = typeof HOOK_NAMES;
type HookName = keyof HookNames;
type MangledHookName = HookNames[HookName];

function getHookName(name: PreactOptionName): MangledHookName | keyof Options {
  if (name in HOOK_NAMES) {
    return HOOK_NAMES[name as HookName];
  } else if (name.startsWith("_")) {
    throw Error(`Unknown hook name: ${name}`);
  } else {
    return name as keyof Options;
  }
}

type HookParams<K extends PreactOptionName> = RawPreactOptions[K] extends AnyFn
  ? Parameters<RawPreactOptions[K]>
  : never;

interface Handler {
  original: () => void;
  override: () => void;
}

const NOOP = (): void => {
  /* noop */
};

class Noop implements Handler {
  original = NOOP;
  override = NOOP;

  constructor(readonly name: string) {}
}

export const HOOK_SUPER = {
  _diff: "after",
  _render: "before",
  diffed: "before",
  _commit: "after",
  unmount: "before",
} as const;

export class AugmentHandler<F extends AnyFn> implements Handler {
  static create<F extends AnyFn>(
    name: string,
    original: F | undefined
  ): AugmentHandler<F> | Noop {
    if (original === undefined) {
      return new Noop(name);
    }
    const handler = new AugmentHandler(name, original);

    if (
      name in HOOK_SUPER &&
      (HOOK_SUPER as Record<string, string>)[name] === "before"
    ) {
      handler.original();
    }

    return handler;
  }

  static finish(handler: AugmentHandler<AnyFn> | Noop): void {
    if (handler instanceof AugmentHandler) {
      if (!handler.#handled) {
        handler.original();
      }
    }
  }

  #name: string;
  #handled = false;
  #original: F;

  private constructor(name: string, original: F) {
    this.#name = name;
    this.#original = original;
  }

  original(): void {
    this.#original();
    this.#handled = true;
  }

  override(): void {
    this.#handled = true;
  }
}

export class AugmentPreactAsComponent {
  readonly #original: RawPreactOptions;

  constructor(original: RawPreactOptions) {
    this.#original = original;
  }

  willRender(hook: (vnode: InternalComponent, handler: Handler) => void): void {
    createHook(this.#original, "_render", (vnode, handler) => {
      if (isUserspaceComponent(vnode)) {
        hook(InternalComponent.of(getVNodeComponent(vnode)), handler);
      }
    });
  }

  diff(hook: (vnode: InternalComponent, handler: Handler) => void): void {
    createHook(this.#original, "_diff", (vnode, handler) => {
      if (isUserspaceComponent(vnode)) {
        hook(InternalComponent.of(getVNodeComponent(vnode)), handler);
      }
    });
  }

  didRender(hook: (vnode: InternalComponent, handler: Handler) => void): void {
    createHook(this.#original, "diffed", (vnode, handler) => {
      if (isUserspaceComponent(vnode)) {
        hook(InternalComponent.of(getVNodeComponent(vnode)), handler);
      }
    });
  }

  unmount(hook: (vnode: InternalComponent, handler: Handler) => void): void {
    createHook(this.#original, "unmount", (vnode, handler) => {
      if (isUserspaceComponent(vnode)) {
        hook(InternalComponent.of(getVNodeComponent(vnode)), handler);
      }
    });
  }
}
