# 布局状态机

## 目的

布局运行时现在使用单一状态源，统一驱动 Banner 可见性、导航栏行为、TOC 可见性以及全局布局偏移。

## 状态结构

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

## 意图（Intents）

- `INIT_PAGE`
- `ROUTE_CHANGED`
- `SCROLL_UPDATE`
- `COLLAPSE_BANNER`
- `EXPAND_BANNER`
- `LOGO_CLICK`
- `RESIZE`

## 状态迁移规则

1. `ROUTE_CHANGED` 与 `INIT_PAGE` 总是根据 URL 解析路由模式：
   - 首页 + `defaultWallpaperMode=banner` => `mode=banner`
   - 其他情况 => `mode=none`
2. `COLLAPSE_BANNER` 仅在以下条件同时满足时允许触发：
   - `mode=banner`
   - 当前路由是首页
   - 视口宽度 >= 1024
3. `LOGO_CLICK` / `EXPAND_BANNER` 仅在首页将 `collapsed -> banner`。
4. 折叠状态是页面局部状态：路由变化后会按路由规则重置模式。

## 运行时分层

1. Reducer：纯状态迁移（`layout-state.ts`）
2. DOM 适配器：唯一允许写入 DOM 的位置（`layout-dom-adapter.ts`）
3. 意图来源：滚动 / swup / 事件生产者（`scroll-ui.ts`、`swup-hooks.ts`）
