# Layout State Machine (V2)

## Purpose

The layout runtime now uses a single state source to drive banner visibility,
navbar behavior, TOC visibility, and global layout offsets.

## State Shape

```ts
export type LayoutMode = "banner" | "collapsed" | "none";

export type LayoutState = {
  mode: LayoutMode;
  isHome: boolean;
  bannerEnabled: boolean;
  navbarTransparentMode: "semi" | "full" | "semifull";
  scrollTop: number;
  viewportWidth: number;
  reason:
    | "initial"
    | "route-change"
    | "scroll-update"
    | "scroll-collapse"
    | "logo-click"
    | "expand"
    | "resize";
};
```

## Intents

- `INIT_PAGE`
- `ROUTE_CHANGED`
- `SCROLL_UPDATE`
- `COLLAPSE_BANNER`
- `EXPAND_BANNER`
- `LOGO_CLICK`
- `RESIZE`

## Transition Rules

1. `ROUTE_CHANGED` and `INIT_PAGE` always resolve route mode from URL:
   - home + `defaultWallpaperMode=banner` => `mode=banner`
   - otherwise => `mode=none`
2. `COLLAPSE_BANNER` is allowed only when:
   - `mode=banner`
   - current route is home
   - viewport width >= 1024
3. `LOGO_CLICK`/`EXPAND_BANNER` promote `collapsed -> banner` only on home.
4. Collapsed state is page-local: route changes reset mode by route rule.

## Runtime Layers

1. Reducer: pure state transitions (`layout-state.ts`)
2. DOM adapter: the only place writing DOM (`layout-dom-adapter.ts`)
3. Intent sources: scroll/swup/event producers (`scroll-ui.ts`, `swup-hooks.ts`)

## Rollback Strategy

Use `systemSiteConfig.experimental.layoutStateMachineV2` in `src/config.ts`.

- `true`: V2 state machine path
- `false`: legacy `scroll-ui-legacy.ts` and `swup-hooks-legacy.ts`
